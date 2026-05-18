/**
 * Gemini File API + generateContent for timestamped script from silent screen recordings.
 */

import path from 'path';
import {
  GoogleGenAI,
  Type,
  createUserContent,
  createPartFromUri,
  type Schema,
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

function getProductContext(): {
  name: string;
  description: string;
  audience: string;
} {
  return {
    name: process.env.PRODUCT_NAME ?? 'the application',
    description:
      process.env.PRODUCT_DESCRIPTION ??
      'a software application demonstrated in the screen recording',
    audience:
      process.env.PRODUCT_AUDIENCE ?? 'people learning to use the software',
  };
}

function buildTranscriptPrompt(): string {
  const { name, description, audience } = getProductContext();
  return `You are analyzing a silent screen recording of ${name}. Produce a timestamped narration script to be read aloud as a warm, natural tutorial voiceover.

PRODUCT CONTEXT:
- The product is called ${name}
- It is ${description}
- Viewers are ${audience}

INTRO (first segment, 0–3s approx):
- Always open with a brief welcome and a specific description of what this tutorial covers
- Name the exact feature or workflow being demonstrated — be specific, not generic
- Use: "Welcome — in this tutorial, we’ll walk through how to..." or "Greetings! In this tutorial, we’ll explore..."
- Always say "tutorial" not "video"

NARRATION STYLE:
- Write like a helpful human talking a viewer through the screen — warm, clear, and varied
- Use inclusive language: "we’ll", "let’s", "you’ll see"
- Mix short punchy lines with longer explanations where it fits
- Don’t start every segment with the same word — vary your openings
- Use correct UI names: button labels, page names, section headings exactly as shown on screen
- NEVER use these words: modal, dialog, widget, component, element, popup — instead describe what it looks like (e.g. "a panel slides open", "a small window appears", "a form pops up")
- NEVER use double-quote characters (") inside any text value

WHAT TO NARRATE:
- Describe what’s visible and what action is taken, in a way that guides the viewer
- Follow an action → outcome rhythm where natural: "Click X — a form opens where you can..."
- When a feature has a clear benefit, briefly explain WHY it matters: e.g. "Due dates you set here will also appear on the customer invoice."
- Use ${name} by name when referring to the app itself

HANDLING DEAD TIME:
- When the screen shows navigation, loading, waiting, or minimal change over a long period — collapse it into ONE short segment covering the whole gap
- Do not create multiple segments for filler actions like clicking a menu, waiting for a page to load, or scrolling with nothing new happening

SEGMENT RULES:
- One clear idea per segment — this can be 1 to 2 sentences if needed
- Match segment boundaries to meaningful scene or action changes, not arbitrary time splits
- Segments covering long pauses or navigation can span many seconds — that is fine

For each segment output:
- start: start time in seconds (number)
- end: end time in seconds (number)
- text: the narration for that moment, written to be read aloud naturally

Respond with a JSON array only (no markdown fences or commentary). Each object must have numeric start/end (seconds) and a string text field for voiceover.

Example format:
[{"start": 0, "end": 3.5, "text": "Welcome — in this tutorial we’ll walk through how to set up a payment schedule and record payments manually."}, {"start": 3.5, "end": 8, "text": "Head to the Payment Schedule section on the order details page and hit Add Schedule — a form opens where you can configure each payment."}]`;
}

/**
 * Escapes unescaped double quotes and literal control characters (newlines, tabs, etc.)
 * inside "text": "..." values — the two most common Gemini JSON failure modes.
 */
function sanitizeTextField(json: string): string {
  return json.replace(/"text"\s*:\s*"([\s\S]*?)"\s*(?=\})/g, (_, content: string) => {
    const fixed = content
      .replace(/\\"/g, '\x00') // protect already-escaped quotes
      .replace(/"/g, '\\"') // escape bare quotes
      .replace(/\x00/g, '\\"') // restore
      .replace(/\n/g, '\\n') // escape literal newlines
      .replace(/\r/g, '\\r') // escape literal carriage returns
      .replace(/\t/g, '\\t'); // escape literal tabs
    return `"text": "${fixed}"`;
  });
}

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

/** Enforces API-level JSON so narration strings are safely escaped (no brittle JSON.parse on prose). */
const SCRIPT_SEGMENTS_RESPONSE_SCHEMA: Schema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      start: { type: Type.NUMBER, description: 'Segment start time in seconds' },
      end: { type: Type.NUMBER, description: 'Segment end time in seconds' },
      text: {
        type: Type.STRING,
        description: 'One sentence read-aloud voiceover for this moment',
      },
    },
    required: ['start', 'end', 'text'],
    propertyOrdering: ['start', 'end', 'text'],
  },
};

function parseSegmentsJson(text: string): unknown {
  const trimmed = text.trim();
  let lastErr: unknown;

  const tryParseWithRepairs = (raw: string): unknown | undefined => {
    const attempts: Array<() => string> = [
      () => raw,
      () => jsonrepair(raw),
      () => sanitizeTextField(raw),
      () => jsonrepair(sanitizeTextField(raw)),
    ];
    for (const attempt of attempts) {
      try {
        return JSON.parse(attempt()) as unknown;
      } catch (err) {
        lastErr = err;
      }
    }
    return undefined;
  };

  let parsed = tryParseWithRepairs(trimmed);
  if (parsed !== undefined) {
    return parsed;
  }

  let jsonStr: string;
  try {
    jsonStr = extractFirstJsonArray(text);
  } catch {
    const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
    throw new Error(`Invalid JSON from Gemini (could not repair): ${msg}`);
  }

  parsed = tryParseWithRepairs(jsonStr);
  if (parsed !== undefined) {
    return parsed;
  }

  const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
  throw new Error(`Invalid JSON from Gemini (could not repair): ${msg}`);
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

  const prompt = `You are a professional voiceover script editor for onboarding and customer support tutorials.

Segment duration: ${durationSeconds.toFixed(1)} seconds (target: ~${(durationSeconds * 2.5).toFixed(0)} words at 150 wpm).

Your task:
- Fix grammar and spelling errors only
- Improve natural speech flow so it sounds like a person speaking, not reading
- Preserve the full meaning and length of the original — do NOT shorten, condense, or remove content
- Do not add new information or change the meaning
- Always return a complete, grammatically correct sentence

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

  const ext = path.extname(videoPath).toLowerCase();
  const mimeTypeForUpload = ext === '.mp4' ? 'video/mp4' : 'video/quicktime';

  const file = await ai.files.upload({
    file: videoPath,
    config: { mimeType: mimeTypeForUpload },
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
  const mimeType = file.mimeType ?? mimeTypeForUpload;
  if (!uri) {
    throw new Error('Gemini file has no URI after processing');
  }

  const response = await ai.models.generateContent({
    model: GEMINI_TRANSCRIPTION_MODEL,
    contents: createUserContent([
      createPartFromUri(uri, mimeType),
      buildTranscriptPrompt(),
    ]),
    config: {
      responseMimeType: 'application/json',
      responseSchema: SCRIPT_SEGMENTS_RESPONSE_SCHEMA,
    },
  });

  const text = response.text?.trim();
  if (!text) {
    throw new Error('Gemini returned no script text');
  }

  const parsed = parseSegmentsJson(text) as unknown;
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
