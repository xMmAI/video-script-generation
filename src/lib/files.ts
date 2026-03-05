import fs from 'fs';
import path from 'path';
import type { ScriptSegment } from '@/types';

export const INPUT_DIR = path.join(process.cwd(), 'input');
export const OUTPUT_DIR = path.join(process.cwd(), 'output');

export function ensureDirs(): void {
  [INPUT_DIR, OUTPUT_DIR].forEach((dir) => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });
}

const INPUT_VIDEO_EXT = ['.mov', '.mp4'];

export function scanInputFolder(): string[] {
  ensureDirs();
  return fs.readdirSync(INPUT_DIR).filter((f) => {
    const ext = path.extname(f).toLowerCase();
    return INPUT_VIDEO_EXT.includes(ext);
  });
}

export function createJobOutputDir(jobId: string): string {
  const dir = path.join(OUTPUT_DIR, jobId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Writes script content to output/[jobId]/[name].md.
 * If inputFileName is provided (e.g. "demo.mov"), the file is named [basename]_script.md (e.g. "demo_script.md").
 */
export function writeScriptMd(
  jobId: string,
  content: string,
  inputFileName?: string
): string {
  const dir = createJobOutputDir(jobId);
  const baseName = inputFileName
    ? path.basename(inputFileName, path.extname(inputFileName))
    : 'script';
  const fileName = inputFileName ? `${baseName}_script.md` : 'script.md';
  const filePath = path.join(dir, fileName);
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

export function readScriptMd(jobId: string, scriptFileName = 'script.md'): string | null {
  const filePath = path.join(OUTPUT_DIR, jobId, scriptFileName);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf-8');
}

/** Read script content by relative path (e.g. "jobId/demo_script.md"). */
export function readScriptByPath(scriptPath: string): string | null {
  const filePath = path.join(OUTPUT_DIR, scriptPath);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf-8');
}

/**
 * Extract plain narrative text from script markdown (strip ## timestamp headers)
 * so it can be sent to TTS.
 */
export function scriptMdToPlainText(md: string): string {
  return md
    .split(/\n+/)
    .filter((line) => !line.startsWith('## '))
    .map((s) => s.trim())
    .filter(Boolean)
    .join('\n\n');
}

const SEGMENT_HEADER_REGEX = /^##\s*(\d+(?:\.\d+)?)s\s*[–-]\s*(\d+(?:\.\d+)?)s\s*$/;

/**
 * Parse script markdown into segments. Only narrative text is in segment.text;
 * timestamp headers are never included (safe to send segment.text to TTS).
 */
export function parseScriptMdToSegments(md: string): ScriptSegment[] {
  const segments: ScriptSegment[] = [];
  const blocks = md.split(/\n(?=## \d)/);
  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    const firstLineEnd = trimmed.indexOf('\n');
    const firstLine = firstLineEnd >= 0 ? trimmed.slice(0, firstLineEnd).trim() : trimmed;
    const match = firstLine.match(SEGMENT_HEADER_REGEX);
    if (!match) continue;
    const start = parseFloat(match[1]);
    const end = parseFloat(match[2]);
    const text = firstLineEnd >= 0 ? trimmed.slice(firstLineEnd + 1).trim() : '';
    if (!text) continue;
    segments.push({ start, end, text });
  }
  return segments;
}

/** Format segment times as filename: e.g. "0.0-5.9.mp3" for video-friendly naming. */
export function segmentToAudioFilename(segment: ScriptSegment): string {
  return `${segment.start.toFixed(1)}-${segment.end.toFixed(1)}.mp3`;
}

/** Serialize segments back to script markdown (## Xs – Ys + narrative). */
export function segmentsToScriptMd(segments: ScriptSegment[]): string {
  return segments
    .map((s) => `## ${s.start}s – ${s.end}s\n\n${s.text}`)
    .join('\n\n');
}

/**
 * Patch a single segment's text in the script file. scriptPath is relative to OUTPUT_DIR (e.g. "jobId/demo_script.md").
 * Returns true if patched and written, false if segment index out of range or file missing.
 */
export function patchSegmentText(
  scriptPath: string,
  segmentIndex: number,
  newText: string
): boolean {
  const fullPath = path.join(OUTPUT_DIR, scriptPath);
  if (!fs.existsSync(fullPath)) return false;
  const content = fs.readFileSync(fullPath, 'utf-8');
  const segments = parseScriptMdToSegments(content);
  if (segmentIndex < 0 || segmentIndex >= segments.length) return false;
  segments[segmentIndex] = { ...segments[segmentIndex], text: newText };
  fs.writeFileSync(fullPath, segmentsToScriptMd(segments), 'utf-8');
  return true;
}
