/**
 * Gemini File API + generateContent for timestamped script from silent screen recordings.
 */

import {
  GoogleGenAI,
  createUserContent,
  createPartFromUri,
} from '@google/genai';
import { jsonrepair } from 'jsonrepair';
import type { ScriptSegment } from '@/types';

export const GEMINI_TRANSCRIPTION_MODEL = 'gemini-2.5-flash';

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set in .env.local');
  }
  return new GoogleGenAI({ apiKey });
}

const TRANSCRIPT_PROMPT = `You are analyzing a silent screen recording (no voiceover). Produce a timestamped script that will be read aloud as a natural, conversational voiceover—not a stiff list of steps.

Style guidelines:
- Write like a helpful human narrator: warm, clear, and varied. Avoid robotic or repetitive phrasing.
- Start your video with an greeting and introduction to the video. This is a video tutorial, so you can start with "In this video, we'll..." or "Welcome to..." or "Greetings!, in this video we'll...". And provide a short introduction to the video, and what we'll be covering.
- Vary sentence length and structure. Mix short punchy lines with longer explanations where it fits.
- Don’t start every segment with "You can..." or "Click the..." or "Now...". Use different openings and phrasing.
- Prefer active, concrete language. Describe what we see and do in a way that sounds like someone talking a viewer through it. While using the correct button names and menu names.
- Keep each segment to one clear idea, but let the tone feel natural—not like a manual.
- Use inclusive language

For each distinct step or scene change, output one segment with:
- start: start time in seconds (number)
- end: end time in seconds (number)
- text: one sentence for that moment, written to be read aloud in a natural voice

Return ONLY a valid JSON array of objects, no markdown or extra text. Example format:
[{"start": 0, "end": 3.5, "text": "Here’s the dashboard—you’ll see your projects listed right away."}, {"start": 3.5, "end": 8, "text": "To start something new, hit the New Project button in the top right."}]`;

/**
 * Extracts the first JSON array from model output (handles code fences and trailing text).
 */
function extractFirstJsonArray(text: string): string {
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) {
    const candidate = codeBlock[1].trim();
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed)) return candidate;
    } catch {
      // fall through to bracket extraction
    }
  }

  const startIdx = text.indexOf('[');
  if (startIdx === -1) {
    throw new Error('No JSON array found in Gemini response');
  }

  let depth = 0;
  let i = startIdx;
  let inString: '"' | "'" | null = null;
  let escape = false;

  while (i < text.length) {
    const c = text[i];
    if (escape) {
      escape = false;
      i++;
      continue;
    }
    if (inString) {
      if (c === '\\') escape = true;
      else if (c === inString) inString = null;
      i++;
      continue;
    }
    if (c === '"' || c === "'") {
      inString = c;
      i++;
      continue;
    }
    if (c === '[') {
      depth++;
      i++;
      continue;
    }
    if (c === ']') {
      depth--;
      if (depth === 0) {
        return text.slice(startIdx, i + 1);
      }
      i++;
      continue;
    }
    i++;
  }

  throw new Error('Unclosed JSON array in Gemini response');
}

/**
 * Asks Gemini to polish a single narration segment for grammar and natural speech flow,
 * constrained to fit within the available time window at ~150 wpm voiceover pace.
 * Returns only the improved plain text — no markdown, no explanation.
 */
export async function polishSegmentText(
  text: string,
  durationSeconds: number
): Promise<string> {
  const ai = getClient();

  const prompt = `You are a voiceover script editor for screen recording tutorials.

Segment duration: ${durationSeconds.toFixed(1)} seconds (at ~150 words/minute, that's ~${(durationSeconds * 2.5).toFixed(0)} words maximum).

Your task:
- Fix grammar and spelling errors
- Improve natural speech flow so it sounds like a person speaking, not reading
- If the text is too long for the duration, trim it while keeping the core message
- Do not add new information or change the meaning

Return ONLY the improved plain text. No quotes, no markdown, no explanation.

Original:
${text}`;

  const response = await ai.models.generateContent({
    model: GEMINI_TRANSCRIPTION_MODEL,
    contents: createUserContent([prompt]),
  });

  const result = response.text?.trim();
  if (!result) {
    throw new Error('Gemini returned no polished text');
  }
  return result;
}

/**
 * Uploads the video at videoPath to Gemini, generates a timestamped script, and returns segments.
 * videoPath must be an absolute path to a .MOV or other supported video file.
 */
export async function generateTimestampedScript(
  videoPath: string
): Promise<ScriptSegment[]> {
  const ai = getClient();

  const file = await ai.files.upload({
    file: videoPath,
    config: { mimeType: 'video/quicktime' },
  });

  if (!file.name) {
    throw new Error('Gemini file upload did not return file name');
  }

  // Wait for video to finish processing (required for large files)
  const maxWaitMs = 120_000; // 2 min
  const pollMs = 2000;
  let elapsed = 0;
  while (elapsed < maxWaitMs) {
    const current = await ai.files.get({ name: file.name });
    const state = current.state ?? '';
    if (state === 'ACTIVE') {
      break;
    }
    if (state === 'FAILED') {
      throw new Error('Gemini file processing failed');
    }
    await new Promise((r) => setTimeout(r, pollMs));
    elapsed += pollMs;
  }
  if (elapsed >= maxWaitMs) {
    throw new Error('Gemini file processing timed out (video may be too long)');
  }

  const uri = file.uri ?? (await ai.files.get({ name: file.name })).uri;
  const mimeType = file.mimeType ?? 'video/quicktime';
  if (!uri) {
    throw new Error('Gemini file has no URI after processing');
  }

  const response = await ai.models.generateContent({
    model: GEMINI_TRANSCRIPTION_MODEL,
    contents: createUserContent([
      createPartFromUri(uri, mimeType),
      TRANSCRIPT_PROMPT,
    ]),
  });

  const text = response.text?.trim();
  if (!text) {
    throw new Error('Gemini returned no script text');
  }

  const jsonStr = extractFirstJsonArray(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr) as unknown;
  } catch (parseErr) {
    try {
      const repaired = jsonrepair(jsonStr);
      parsed = JSON.parse(repaired) as unknown;
    } catch (repairErr) {
      const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
      throw new Error(`Invalid JSON from Gemini (e.g. unescaped quotes in text): ${msg}`);
    }
  }
  if (!Array.isArray(parsed)) {
    throw new Error('Gemini response is not a JSON array');
  }

  const segments: ScriptSegment[] = parsed
    .filter(
      (item): item is Record<string, unknown> =>
        item !== null && typeof item === 'object'
    )
    .map((item) => ({
      start: Number(item.start) || 0,
      end: Number(item.end) || 0,
      text: typeof item.text === 'string' ? item.text : String(item.text ?? ''),
    }));

  return segments;
}
