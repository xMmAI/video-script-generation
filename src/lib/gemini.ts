/**
 * Gemini File API + generateContent for timestamped script from silent screen recordings.
 */

import {
  GoogleGenAI,
  createUserContent,
  createPartFromUri,
} from '@google/genai';
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
  const parsed = JSON.parse(jsonStr) as unknown;
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
