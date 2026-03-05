import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import db from '@/lib/db';
import { INPUT_DIR } from '@/lib/files';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * DELETE /api/jobs/[id]/video
 * Hard-deletes the job's input video from the /input folder, then resets the job
 * to pending (clears script_path etc.) so a re-uploaded file with the same name
 * can be processed again via the UI.
 */
export async function DELETE(_request: Request, context: RouteContext) {
  const { id: jobId } = await context.params;
  const row = db
    .prepare('SELECT id, input_file FROM jobs WHERE id = ?')
    .get(jobId) as { id: string; input_file: string | null } | undefined;

  if (!row) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  const inputFile = row.input_file;
  if (!inputFile || !inputFile.trim()) {
    return NextResponse.json(
      { error: 'Job has no input file' },
      { status: 400 }
    );
  }

  const videoPath = path.join(INPUT_DIR, inputFile);
  const resolvedPath = path.resolve(videoPath);
  const resolvedInputDir = path.resolve(INPUT_DIR);
  const relative = path.relative(resolvedInputDir, resolvedPath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return NextResponse.json(
      { error: 'Invalid input file path' },
      { status: 400 }
    );
  }

  if (!fs.existsSync(resolvedPath)) {
    return NextResponse.json(
      { error: 'Video file not found in /input (may already be deleted)' },
      { status: 404 }
    );
  }

  try {
    fs.unlinkSync(resolvedPath);
  } catch (err) {
    console.error('[DELETE /api/jobs/[id]/video]', jobId, err);
    return NextResponse.json(
      { error: 'Failed to delete file from disk' },
      { status: 500 }
    );
  }

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE jobs SET status = ?, script_path = ?, audio_path = ?, updated_at = ? WHERE id = ?`
  ).run('pending', null, null, now, jobId);

  return NextResponse.json({
    ok: true,
    jobId,
    status: 'pending',
    message: 'Video deleted. Re-upload a file with the same name to /input, then use Process.',
  });
}
