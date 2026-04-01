import fs from 'fs';
import path from 'path';
import type { JobStatus, ScriptSegment } from '@/types';

export const INPUT_DIR = path.join(process.cwd(), 'input');
export const OUTPUT_DIR = path.join(process.cwd(), 'output');

/** Filename stored in each job output dir to link output back to input file (for rehydration after DB loss). */
const INPUT_FILE_MANIFEST = '.input_file';

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
  const withoutComments = stripHtmlComments(md);
  return withoutComments
    .split(/\n+/)
    .filter((line) => !line.startsWith('## '))
    .map((s) => s.trim())
    .filter(Boolean)
    .join('\n\n');
}

function stripHtmlComments(s: string): string {
  return s.replace(/<!--[\s\S]*?-->/g, '');
}

const SEGMENT_HEADER_REGEX = /^##\s*(\d+(?:\.\d+)?)s\s*[–-]\s*(\d+(?:\.\d+)?)s\s*$/;

/**
 * Parse script markdown into segments. Only narrative text is in segment.text;
 * timestamp headers are never included (safe to send segment.text to TTS).
 */
export function parseScriptMdToSegments(md: string): ScriptSegment[] {
  const segments: ScriptSegment[] = [];
  const blocks = stripHtmlComments(md).split(/\n(?=## \d)/);
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

/**
 * Writes a manifest in output/[jobId]/.input_file so we can re-associate this output
 * with the input file after DB loss (e.g. Gemini retention expiry).
 */
export function writeInputFileManifest(jobId: string, inputFileName: string): void {
  const dir = path.join(OUTPUT_DIR, jobId);
  if (!fs.existsSync(dir)) return;
  fs.writeFileSync(path.join(dir, INPUT_FILE_MANIFEST), inputFileName, 'utf-8');
}

/**
 * Script filename we expect for an input file (e.g. "foo.mov" -> "foo_script.md").
 * Used to find output folder when .input_file manifest is missing (jobs processed before manifest existed).
 */
function scriptFilenameForInput(inputFile: string): string {
  const base = path.basename(inputFile, path.extname(inputFile));
  return `${base}_script.md`;
}

/**
 * Finds a job id whose output folder belongs to this input file.
 * 1) Checks .input_file manifest in each output dir.
 * 2) If none match, looks for a dir containing {inputBasename}_script.md (handles jobs processed before manifest existed).
 */
export function findJobIdByInputFile(inputFile: string): string | null {
  ensureDirs();
  const entries = fs.readdirSync(OUTPUT_DIR, { withFileTypes: true });
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const manifestPath = path.join(OUTPUT_DIR, ent.name, INPUT_FILE_MANIFEST);
    if (fs.existsSync(manifestPath)) {
      const content = fs.readFileSync(manifestPath, 'utf-8').trim();
      if (content === inputFile) return ent.name;
    }
  }
  const expectedScript = scriptFilenameForInput(inputFile);
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const scriptPath = path.join(OUTPUT_DIR, ent.name, expectedScript);
    if (fs.existsSync(scriptPath)) return ent.name;
  }
  return null;
}

export type RehydratedJob = {
  script_path: string;
  audio_path: string | null;
  status: JobStatus;
  final_video_path?: string | null;
};

/**
 * Derives script_path, audio_path, status, and optional final_video_path from files on disk for a job.
 * Use to rehydrate job state when DB says pending but output exists (e.g. after DB reset).
 */
export function rehydrateJobFromDisk(jobId: string): RehydratedJob | null {
  const dir = path.join(OUTPUT_DIR, jobId);
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir);
  const scriptFile = files.find((f) => f.endsWith('_script.md') || f === 'script.md');
  if (!scriptFile) return null;
  const script_path = `${jobId}/${scriptFile}`;
  const hasAudioMp3 = files.includes('audio.mp3');
  const segmentMp3s = files.filter((f) => /^\d+\.\d+-\d+\.\d+\.mp3$/.test(f));
  const hasAudio = hasAudioMp3 || segmentMp3s.length > 0;
  const audio_path = hasAudio ? `${jobId}/audio.mp3` : null;
  const hasFinal = files.includes('final.mp4');
  const final_video_path = hasFinal ? `${jobId}/final.mp4` : null;
  const status: JobStatus = hasFinal ? 'rendered' : hasAudio ? 'done' : 'review';
  return { script_path, audio_path, status, final_video_path };
}
