import fs from 'fs';
import path from 'path';
import { execa } from 'execa';
import { OUTPUT_DIR } from './files';

const FFMPEG_NOT_FOUND_MESSAGE =
  'FFmpeg not found. Install via: brew install ffmpeg (Mac) or winget install ffmpeg (Windows)';

const TEMP_DIR = path.join(OUTPUT_DIR, 'temp');

function ensureTempDir(): void {
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }
}

export async function checkFFmpeg(): Promise<void> {
  try {
    await execa('ffmpeg', ['-version']);
  } catch (err) {
    const isNotFound =
      (err as NodeJS.ErrnoException).code === 'ENOENT' ||
      /not found/i.test(String((err as Error).message ?? ''));
    if (isNotFound) {
      throw new Error(FFMPEG_NOT_FOUND_MESSAGE);
    }
    throw err;
  }
}

export async function getVideoDuration(filePath: string): Promise<number> {
  ensureTempDir();
  const args = [
    '-v',
    'quiet',
    '-print_format',
    'json',
    '-show_format',
    '-show_streams',
    filePath,
  ];
  const { stdout } = await execa('ffprobe', args);
  const parsed = JSON.parse(stdout) as {
    format?: { duration?: string };
    streams?: Array<{ duration?: string }>;
  };

  const durationStr =
    parsed.format?.duration ??
    parsed.streams?.find((s) => s.duration !== undefined)?.duration;

  if (!durationStr) {
    throw new Error(`Unable to determine duration for video: ${filePath}`);
  }

  const duration = parseFloat(durationStr);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`Invalid video duration "${durationStr}" for: ${filePath}`);
  }

  return duration;
}

export async function splitAvatar(
  assetPath: string,
  duration: number
): Promise<{ introPath: string; outroPath: string }> {
  ensureTempDir();
  const introPath = path.join(TEMP_DIR, 'avatar_intro.mp4');
  const outroPath = path.join(TEMP_DIR, 'avatar_outro.mp4');

  // Prefer first 10s and last 10s when the clip is long enough; otherwise fall back to a mid split.
  let introEnd: number;
  let outroStart: number;
  if (duration > 20) {
    introEnd = 10;
    outroStart = Math.max(duration - 10, introEnd);
  } else {
    const half = duration / 2;
    introEnd = half;
    outroStart = half;
  }

  const introTs = introEnd.toFixed(3);
  const outroStartTs = outroStart.toFixed(3);

  console.log(
    `[ffmpeg] Splitting avatar at ${assetPath}. Intro: 0 -> ${introTs}s, Outro: ${outroStartTs}s -> ${duration.toFixed(
      3
    )}s`
  );

  // Intro: 0 to introEnd
  await execa('ffmpeg', [
    '-y',
    '-i',
    assetPath,
    '-ss',
    '0',
    '-t',
    introTs,
    '-c',
    'copy',
    introPath,
  ]);

  // Outro: outroStart to end
  await execa('ffmpeg', [
    '-y',
    '-i',
    assetPath,
    '-ss',
    outroStartTs,
    '-c',
    'copy',
    outroPath,
  ]);

  return { introPath, outroPath };
}

export async function convertMovToMp4(
  inputPath: string,
  outputPath: string
): Promise<string> {
  ensureTempDir();
  await execa('ffmpeg', [
    '-y',
    '-i',
    inputPath,
    '-c:v',
    'libx264',
    '-c:a',
    'aac',
    '-movflags',
    '+faststart',
    outputPath,
  ]);
  return outputPath;
}

async function stripAudio(inputPath: string, outputPath: string): Promise<string> {
  await execa('ffmpeg', ['-y', '-i', inputPath, '-c:v', 'copy', '-an', outputPath]);
  return outputPath;
}

async function ensureSingleAudioTrack(
  jobOutputDir: string,
  audioPath: string
): Promise<string> {
  // If the provided audioPath already exists, use it.
  if (fs.existsSync(audioPath) && fs.statSync(audioPath).isFile()) {
    return audioPath;
  }

  const mergedPath = path.join(jobOutputDir, 'audio.mp3');
  if (fs.existsSync(mergedPath) && fs.statSync(mergedPath).isFile()) {
    return mergedPath;
  }

  // Otherwise, try to concatenate per-segment MP3 files in the job output dir.
  const files = fs
    .readdirSync(jobOutputDir)
    .filter(
      (f) =>
        f.toLowerCase().endsWith('.mp3') &&
        f.toLowerCase() !== 'audio.mp3'
    );

  if (!files.length) {
    throw new Error(
      `No audio found for stitching. Expected ${mergedPath} or segment MP3s in ${jobOutputDir}`
    );
  }

  // Sort by start timestamp encoded in filename (e.g. "0.0-5.9.mp3").
  const SEGMENT_RE = /^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)\.mp3$/i;
  const sorted = files
    .map((f) => {
      const m = f.match(SEGMENT_RE);
      const start = m ? parseFloat(m[1]) : Number.NaN;
      return { file: f, start };
    })
    .sort((a, b) => (a.start || 0) - (b.start || 0))
    .map((x) => x.file);

  const listFile = path.join(TEMP_DIR, `concat_audio_${Date.now()}.txt`);
  const listContent = sorted
    .map((f) =>
      `file '${path.join(jobOutputDir, f).replace(/'/g, "'\\''")}'`
    )
    .join('\n');
  fs.writeFileSync(listFile, listContent, 'utf-8');

  await execa('ffmpeg', [
    '-y',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    listFile,
    '-c',
    'copy',
    mergedPath,
  ]);

  return mergedPath;
}

export async function stitchVideo(params: {
  screenRecordingPath: string;
  avatarOverlayPath: string;
  audioPath: string;
  outputPath: string;
}): Promise<string> {
  ensureTempDir();

  const { screenRecordingPath, avatarOverlayPath, audioPath, outputPath } = params;

  const jobOutputDir = path.dirname(outputPath);

  // Step 1: convert screen recording MOV to MP4 if needed.
  const ext = path.extname(screenRecordingPath).toLowerCase();
  let screenMp4Path = screenRecordingPath;
  if (ext === '.mov') {
    screenMp4Path = path.join(
      TEMP_DIR,
      `${path.basename(screenRecordingPath, ext)}.mp4`
    );
    await convertMovToMp4(screenRecordingPath, screenMp4Path);
  }

  // Step 2: strip audio from screen recording (we use ElevenLabs audio instead).
  const screenNoAudioPath = path.join(TEMP_DIR, 'screen_no_audio.mp4');
  await stripAudio(screenMp4Path, screenNoAudioPath);

  // Step 3: overlay avatar as a picture-in-picture on the bottom-left.
  const overlayVideoPath = path.join(TEMP_DIR, 'video_overlay.mp4');
  await execa('ffmpeg', [
    '-y',
    '-i',
    screenNoAudioPath,
    '-i',
    avatarOverlayPath,
    '-filter_complex',
    "[1:v]scale=iw*0.5:-1[avatar];" +
      "[avatar]pad=iw+40:ih+40:20:20:color=#00000000,format=rgba," +
      "drawbox=x=0:y=0:w=iw:h=ih:color=#228B22@1:t=6[framed];" +
      "[0:v][framed]overlay=20:main_h-overlay_h-20:enable='between(t,0,10)'",
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '18',
    overlayVideoPath,
  ]);

  // Step 4: ensure we have a single audio.mp3 track.
  const resolvedAudioPath = await ensureSingleAudioTrack(jobOutputDir, audioPath);

  // Step 5: merge overlaid video with audio.mp3 into final.mp4.
  await execa('ffmpeg', [
    '-y',
    '-i',
    overlayVideoPath,
    '-i',
    resolvedAudioPath,
    '-c:v',
    'copy',
    '-c:a',
    'aac',
    '-shortest',
    outputPath,
  ]);

  return outputPath;
}

