import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import db from '@/lib/db';
import { findJobIdByInputFile, rehydrateJobFromDisk, scanInputFolder } from '@/lib/files';

/**
 * GET /api/scan
 * Scans /input folder. For files not already in DB: if output exists (from a previous run),
 * re-registers that job so completed scripts/audio are not lost; otherwise creates a new pending job.
 */
export async function GET() {
  const files = scanInputFolder();
  const rows = db.prepare('SELECT id, input_file FROM jobs').all() as Array<{ id: string; input_file: string | null }>;
  const existingInputs = new Set(rows.map((r) => r.input_file).filter(Boolean) as string[]);
  const existingIds = new Set(rows.map((r) => r.id));

  const newFiles = files.filter((f) => !existingInputs.has(f));
  const created: Array<{
    id: string;
    title: string | null;
    status: string;
    input_file: string;
    created_at: string;
    updated_at: string;
  }> = [];

  const now = new Date().toISOString();
  const insert = db.prepare(`
    INSERT INTO jobs (id, title, status, input_file, script_path, audio_path, avatar_intro_path, avatar_outro_path, final_video_path, youtube_url, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const filename of newFiles) {
    const existingJobId = findJobIdByInputFile(filename);
    const rehydrated = existingJobId ? rehydrateJobFromDisk(existingJobId) : null;

    if (existingJobId && rehydrated && !existingIds.has(existingJobId)) {
      insert.run(
        existingJobId,
        null,
        rehydrated.status,
        filename,
        rehydrated.script_path,
        rehydrated.audio_path,
        null,
        null,
        rehydrated.final_video_path ?? null,
        null,
        now,
        now
      );
      existingIds.add(existingJobId);
      created.push({
        id: existingJobId,
        title: null,
        status: rehydrated.status,
        input_file: filename,
        created_at: now,
        updated_at: now,
      });
    } else {
      const id = uuidv4();
      insert.run(id, null, 'pending', filename, null, null, null, null, null, null, now, now);
      created.push({
        id,
        title: null,
        status: 'pending',
        input_file: filename,
        created_at: now,
        updated_at: now,
      });
    }
  }

  return NextResponse.json({ created, scanned: files.length });
}
