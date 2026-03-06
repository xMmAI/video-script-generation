import { NextResponse } from 'next/server';
import path from 'path';
import db from '@/lib/db';
import { INPUT_DIR, writeInputFileManifest, writeScriptMd } from '@/lib/files';
import { generateTimestampedScript } from '@/lib/gemini';
import fs from 'fs';

/**
 * POST /api/process
 * Body: { jobId: string }
 * Uploads the job's input video to Gemini, generates a timestamped script,
 * writes /output/[jobId]/script.md, and sets job status to 'review'.
 */
export async function POST(request: Request) {
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

  const row = db.prepare('SELECT id, input_file FROM jobs WHERE id = ?').get(jobId) as
    | { id: string; input_file: string | null }
    | undefined;
  if (!row) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  const inputFile = row.input_file;
  if (!inputFile) {
    return NextResponse.json(
      { error: 'Job has no input file (input_file is empty)' },
      { status: 400 }
    );
  }

  const videoPath = path.join(INPUT_DIR, inputFile);
  if (!fs.existsSync(videoPath)) {
    return NextResponse.json(
      { error: `Input file not found: ${inputFile}. Place it in the /input folder.` },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  db.prepare('UPDATE jobs SET status = ?, updated_at = ? WHERE id = ?').run(
    'transcribing',
    now,
    jobId
  );

  try {
    const segments = await generateTimestampedScript(videoPath);

    const mdLines = segments.map(
      (s) => `## ${s.start.toFixed(1)}s – ${s.end.toFixed(1)}s\n\n${s.text}`
    );
    const scriptContent = mdLines.length
      ? mdLines.join('\n\n')
      : '(No segments generated)';

    const writtenPath = writeScriptMd(jobId, scriptContent, inputFile);
    const scriptPath = `${jobId}/${path.basename(writtenPath)}`;
    writeInputFileManifest(jobId, inputFile);
    db.prepare(
      'UPDATE jobs SET status = ?, script_path = ?, updated_at = ? WHERE id = ?'
    ).run('review', scriptPath, new Date().toISOString(), jobId);

    return NextResponse.json({
      ok: true,
      jobId,
      status: 'review',
      segmentsCount: segments.length,
      scriptPath,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Transcription failed';
    console.error('[POST /api/process]', jobId, err);
    db.prepare('UPDATE jobs SET status = ?, updated_at = ? WHERE id = ?').run(
      'failed',
      new Date().toISOString(),
      jobId
    );
    return NextResponse.json(
      { error: 'Transcription failed', details: message },
      { status: 500 }
    );
  }
}
