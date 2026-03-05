import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import db from '@/lib/db';
import { INPUT_DIR, OUTPUT_DIR, createJobOutputDir, readScriptByPath, scriptMdToPlainText } from '@/lib/files';
import { checkFFmpeg, convertMovToMp4, getVideoDuration, stitchVideo } from '@/lib/ffmpeg';
import type { Job } from '@/types';
import { textToSpeech } from '@/lib/elevenlabs';

type RouteContext = { params: Promise<unknown> };

/**
 * POST /api/render
 * Body: { jobId: string }
 */
export async function POST(request: Request, _context: RouteContext) {
  let body: { jobId?: string };
  try {
    body = (await request.json()) as { jobId?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const jobId = body.jobId;
  if (!jobId || typeof jobId !== 'string') {
    return NextResponse.json({ error: 'jobId is required' }, { status: 400 });
  }

  const row = db
    .prepare(
      'SELECT id, title, status, input_file, script_path, audio_path, avatar_intro_path, avatar_outro_path, final_video_path FROM jobs WHERE id = ?'
    )
    .get(jobId) as
    | {
        id: string;
        title: string | null;
        status: Job['status'];
        input_file: string | null;
        script_path: string | null;
        audio_path: string | null;
        avatar_intro_path: string | null;
        avatar_outro_path: string | null;
        final_video_path: string | null;
      }
    | undefined;

  if (!row) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  if (row.status !== 'done' && row.status !== 'rendered') {
    return NextResponse.json(
      {
        error: `Job must be in 'done' or 'rendered' status to render. Current status: ${row.status}`,
      },
      { status: 400 }
    );
  }

  if (!row.input_file) {
    return NextResponse.json(
      { error: 'Job has no input file (input_file is empty)' },
      { status: 400 }
    );
  }

  const outputDir = createJobOutputDir(jobId);
  const audioFileOnDisk = path.join(outputDir, 'audio.mp3');
  const inputVideoPath = path.join(INPUT_DIR, row.input_file);
  const avatarMp4Path = path.join(process.cwd(), 'assets', 'talking_whisk.mp4');
  const avatarMovPath = path.join(process.cwd(), 'assets', 'talking_whisk.mov');
  const fallbackAvatarMp4Path = path.join(process.cwd(), 'assets', 'avatar.mp4');
  const avatarPath = fs.existsSync(avatarMp4Path)
    ? avatarMp4Path
    : fs.existsSync(avatarMovPath)
    ? avatarMovPath
    : fallbackAvatarMp4Path;

  if (!fs.existsSync(inputVideoPath)) {
    return NextResponse.json(
      {
        error: `Input file not found: ${row.input_file}. Place it in the /input folder.`,
      },
      { status: 400 }
    );
  }

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  if (!fs.existsSync(avatarPath)) {
    return NextResponse.json(
      {
        error:
          'Avatar file not found. Expected assets/talking_whisk.mp4, assets/talking_whisk.mov, or assets/avatar.mp4',
      },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  db.prepare('UPDATE jobs SET status = ?, updated_at = ? WHERE id = ?').run(
    'rendering',
    now,
    jobId
  );

  try {
    // 6. Run checkFFmpeg() — return 500 with install instructions if missing
    await checkFFmpeg();

    // Ensure we have a single audio.mp3 track. If it's missing, synthesize from full script.
    if (!fs.existsSync(audioFileOnDisk)) {
      if (!row.script_path) {
        throw new Error(
          'No script_path found for job. Cannot synthesize full-length audio.'
        );
      }
      const scriptMd = readScriptByPath(row.script_path);
      if (!scriptMd) {
        throw new Error(
          `Script file not found at /output/${row.script_path}. Re-run Process first.`
        );
      }
      const plain = scriptMdToPlainText(scriptMd);
      const buffer = await textToSpeech(plain);
      fs.writeFileSync(audioFileOnDisk, buffer);
      db.prepare(
        'UPDATE jobs SET audio_path = ?, updated_at = ? WHERE id = ?'
      ).run(`${jobId}/audio.mp3`, new Date().toISOString(), jobId);
    }

    // 7. Prepare avatar overlay clip (convert to MP4 if needed and log duration)
    const avatarDuration = await getVideoDuration(avatarPath);
    const avatarExt = path.extname(avatarPath).toLowerCase();
    let avatarOverlayPath = avatarPath;
    if (avatarExt === '.mov') {
      avatarOverlayPath = path.join(OUTPUT_DIR, 'temp', 'avatar_overlay.mp4');
      await convertMovToMp4(avatarPath, avatarOverlayPath);
    }

    // 8. Call stitchVideo() with screen recording, avatar overlay, and audio
    const finalVideoPathOnDisk = path.join(outputDir, 'final.mp4');
    await stitchVideo({
      screenRecordingPath: inputVideoPath,
      avatarOverlayPath,
      audioPath: audioFileOnDisk,
      outputPath: finalVideoPathOnDisk,
    });

    const finalVideoPath = `${jobId}/final.mp4`;
    db.prepare(
      'UPDATE jobs SET status = ?, final_video_path = ?, updated_at = ? WHERE id = ?'
    ).run('rendered', finalVideoPath, new Date().toISOString(), jobId);

    return NextResponse.json({
      success: true,
      jobId,
      finalVideoPath,
      avatarDurationSeconds: avatarDuration,
      audioPath: `${jobId}/audio.mp3`,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Render failed. Unknown error.';
    console.error('[POST /api/render]', jobId, err);
    db.prepare('UPDATE jobs SET status = ?, updated_at = ? WHERE id = ?').run(
      'failed',
      new Date().toISOString(),
      jobId
    );
    const status =
      message.includes('FFmpeg not found') || message.includes('ffmpeg')
        ? 500
        : 500;
    return NextResponse.json(
      {
        error: 'Render failed',
        details: message,
      },
      { status }
    );
  }
}

