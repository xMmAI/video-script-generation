import fs from 'fs';
import path from 'path';
import { execa } from 'execa';
import { OUTPUT_DIR } from './files';
import type { ScriptSegment } from '@/types';

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

async function getMediaDuration(filePath: string): Promise<number> {
  const args = [
    '-v', 'quiet',
    '-print_format', 'json',
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
    throw new Error(`Unable to determine duration for: ${filePath}`);
  }

  const duration = parseFloat(durationStr);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`Invalid duration "${durationStr}" for: ${filePath}`);
  }

  return duration;
}

export async function getVideoDuration(filePath: string): Promise<number> {
  ensureTempDir();
  return getMediaDuration(filePath);
}

export async function getAudioDuration(filePath: string): Promise<number> {
  return getMediaDuration(filePath);
}

export async function extractClip(
  input: string,
  startSeconds: number,
  durationSeconds: number,
  output: string
): Promise<void> {
  await execa('ffmpeg', [
    '-y',
    '-i', input,
    '-ss', startSeconds.toFixed(3),
    '-t', durationSeconds.toFixed(3),
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '18',
    '-an',
    output,
  ]);
}

export async function freezeExtend(
  input: string,
  extraSeconds: number,
  output: string
): Promise<void> {
  await execa('ffmpeg', [
    '-y',
    '-i', input,
    '-vf', `tpad=stop_mode=clone:stop_duration=${extraSeconds.toFixed(3)}`,
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '18',
    '-an',
    output,
  ]);
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

async function padAudioWithSilence(input: string, targetDuration: number, output: string): Promise<void> {
  // apad=pad_dur adds silence in the same format as the input (correct sample rate/channels),
  // then atrim=end cuts to exactly the target. This avoids apad=whole_dur ambiguity in FFmpeg 8.
  await execa('ffmpeg', [
    '-y',
    '-i', input,
    '-af', `apad=pad_dur=300,atrim=end=${targetDuration.toFixed(3)}`,
    '-c:a', 'libmp3lame',
    '-q:a', '2',
    output,
  ]);
}

async function createSilence(duration: number, output: string): Promise<void> {
  await execa('ffmpeg', [
    '-y',
    '-f', 'lavfi',
    '-i', `anullsrc=channel_layout=stereo:sample_rate=44100`,
    '-t', duration.toFixed(3),
    '-c:a', 'libmp3lame',
    '-q:a', '2',
    output,
  ]);
}

export async function stitchVideo(params: {
  screenRecordingPath: string;
  avatarOverlayPath: string;
  audioPath: string;
  outputPath: string;
  segments?: ScriptSegment[];
  jobOutputDir?: string;
}): Promise<string> {
  ensureTempDir();

  const { screenRecordingPath, avatarOverlayPath, audioPath, outputPath, segments, jobOutputDir } = params;
  const jobDir = path.dirname(outputPath);

  // Step 1: convert screen recording MOV to MP4 if needed.
  const ext = path.extname(screenRecordingPath).toLowerCase();
  let screenMp4Path = screenRecordingPath;
  if (ext === '.mov') {
    screenMp4Path = path.join(TEMP_DIR, `${path.basename(screenRecordingPath, ext)}.mp4`);
    await convertMovToMp4(screenRecordingPath, screenMp4Path);
  }

  // Step 2: strip audio from screen recording (we use ElevenLabs audio instead).
  const screenNoAudioPath = path.join(TEMP_DIR, 'screen_no_audio.mp4');
  await stripAudio(screenMp4Path, screenNoAudioPath);

  let videoForOverlay: string;
  let segmentAudioPath: string | null = null;

  if (segments && segments.length > 0 && jobOutputDir) {
    // Step 3 (segment-aware): per-segment, adjust video and build a matching audio track.
    // - audio > clip  → freeze-extend video; audio plays as-is
    // - clip > audio  → video plays at full speed; audio padded with silence to fill the gap
    // Both tracks are concatenated so total durations always match.
    const adjustedClips: string[] = [];
    const adjustedAudios: string[] = [];
    let lastValidClipPath: string | null = null;

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const audioFile = path.join(jobOutputDir, `${seg.start.toFixed(1)}-${seg.end.toFixed(1)}.mp3`);

      const segDuration = seg.end - seg.start;
      let finalClipPath: string;
      let finalAudioPath: string;

      if (!fs.existsSync(audioFile)) {
        // No audio for this segment — extract full scene duration, use silence.
        const segClipPath = path.join(TEMP_DIR, `seg_clip_${i}.mp4`);
        await extractClip(screenNoAudioPath, seg.start, segDuration, segClipPath);
        let clipDuration = 0;
        try { clipDuration = await getAudioDuration(segClipPath); } catch { clipDuration = 0; }
        if (clipDuration < 0.05) {
          console.warn(`[ffmpeg] Segment ${i}: no audio and empty clip — skipping`);
          continue;
        }
        lastValidClipPath = segClipPath;
        const silentAudioPath = path.join(TEMP_DIR, `seg_audio_silent_${i}.mp3`);
        await createSilence(clipDuration, silentAudioPath);
        finalClipPath = segClipPath;
        finalAudioPath = silentAudioPath;
        console.warn(`[ffmpeg] Segment ${i}: no audio file — using silence for ${clipDuration.toFixed(2)}s`);
      } else {
        // Audio drives duration: extract only min(audioDuration, segDuration) of video.
        // This prevents dead-time padding from accumulating across segments.
        const audioDuration = await getAudioDuration(audioFile);
        const extractDuration = Math.min(audioDuration, segDuration);

        const segClipPath = path.join(TEMP_DIR, `seg_clip_${i}.mp4`);
        await extractClip(screenNoAudioPath, seg.start, extractDuration, segClipPath);

        let clipDuration = 0;
        try { clipDuration = await getAudioDuration(segClipPath); } catch { clipDuration = 0; }

        if (clipDuration < 0.05) {
          // Past the real video end — freeze last known frame for the full audio duration.
          if (!lastValidClipPath) {
            console.warn(`[ffmpeg] Segment ${i}: empty clip, no last frame — skipping`);
            continue;
          }
          const lastClipDur = await getAudioDuration(lastValidClipPath);
          const frameStart = Math.max(0, lastClipDur - 0.08);
          const lastFramePath = path.join(TEMP_DIR, `seg_lastframe_${i}.mp4`);
          await extractClip(lastValidClipPath, frameStart, lastClipDur - frameStart, lastFramePath);
          const frozenPath = path.join(TEMP_DIR, `seg_adj_${i}.mp4`);
          await freezeExtend(lastFramePath, audioDuration - (lastClipDur - frameStart), frozenPath);
          finalClipPath = frozenPath;
          finalAudioPath = audioFile;
          console.log(`[ffmpeg] Segment ${i}: past video end — freeze last frame for ${audioDuration.toFixed(2)}s audio`);
        } else if (clipDuration < audioDuration - 0.05) {
          // Video clip shorter than audio (hit real end mid-extract) → freeze-extend.
          lastValidClipPath = segClipPath;
          const segAdjPath = path.join(TEMP_DIR, `seg_adj_${i}.mp4`);
          await freezeExtend(segClipPath, audioDuration - clipDuration, segAdjPath);
          finalClipPath = segAdjPath;
          finalAudioPath = audioFile;
          console.log(`[ffmpeg] Segment ${i}: clip=${clipDuration.toFixed(2)}s audio=${audioDuration.toFixed(2)}s → freeze-extended by ${(audioDuration - clipDuration).toFixed(2)}s`);
        } else {
          // Clip matches audio (or is within 0.05s). Use both as-is.
          lastValidClipPath = segClipPath;
          finalClipPath = segClipPath;
          finalAudioPath = audioFile;
          console.log(`[ffmpeg] Segment ${i}: clip=${clipDuration.toFixed(2)}s audio=${audioDuration.toFixed(2)}s → matched (extracted ${extractDuration.toFixed(2)}s of ${segDuration.toFixed(2)}s scene)`);
        }
      }

      adjustedClips.push(finalClipPath);
      adjustedAudios.push(finalAudioPath);
    }

    // Concatenate adjusted video clips.
    const concatListPath = path.join(TEMP_DIR, `concat_clips_${Date.now()}.txt`);
    fs.writeFileSync(concatListPath, adjustedClips.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'), 'utf-8');
    const combinedVideoPath = path.join(TEMP_DIR, 'combined_video.mp4');
    await execa('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', concatListPath, '-c', 'copy', combinedVideoPath]);

    // Concatenate adjusted audio files (with silence padding where clip > audio).
    const concatAudioListPath = path.join(TEMP_DIR, `concat_audio_${Date.now()}.txt`);
    fs.writeFileSync(concatAudioListPath, adjustedAudios.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'), 'utf-8');
    const combinedAudioPath = path.join(TEMP_DIR, 'combined_audio.mp3');
    await execa('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', concatAudioListPath, '-c', 'copy', combinedAudioPath]);

    videoForOverlay = combinedVideoPath;
    segmentAudioPath = combinedAudioPath;
  } else {
    videoForOverlay = screenNoAudioPath;
  }

  // Step 4: overlay avatar as a picture-in-picture on the bottom-left.
  const avatarDur = await getVideoDuration(avatarOverlayPath);
  const overlayVideoPath = path.join(TEMP_DIR, 'video_overlay.mp4');
  await execa('ffmpeg', [
    '-y',
    '-i', videoForOverlay,
    '-i', avatarOverlayPath,
    '-filter_complex',
    // Scale to 50%, white background (8px), subtle gray outline (2px), rounded corners (radius 28 outer ≈ 18 inner).
    "[1:v]scale=iw*0.5:-1," +
      "pad=iw+16:ih+16:8:8:color=white," +
      "pad=iw+4:ih+4:2:2:color=#999999," +
      "format=rgba," +
      "geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='255*lte(hypot(max(0,max(28-X,X-(W-28))),max(0,max(28-Y,Y-(H-28)))),28)'[framed];" +
      `[0:v][framed]overlay=20:main_h-overlay_h-20:enable='between(t,0,${avatarDur.toFixed(3)})'`,
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '18',
    overlayVideoPath,
  ]);

  // Step 5: use segment-built audio (with silence padding) if available, else fall back to audio.mp3.
  const resolvedAudioPath = segmentAudioPath ?? await ensureSingleAudioTrack(jobDir, audioPath);

  // Step 6: merge overlaid video with audio into final.mp4 (no -shortest: video drives duration).
  await execa('ffmpeg', [
    '-y',
    '-i', overlayVideoPath,
    '-i', resolvedAudioPath,
    '-c:v', 'copy',
    '-c:a', 'aac',
    outputPath,
  ]);

  return outputPath;
}

