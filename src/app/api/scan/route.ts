import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import db from '@/lib/db';
import { scanInputFolder } from '@/lib/files';

/**
 * GET /api/scan
 * Scans /input folder, creates job records for new .MOV files not already in DB.
 * Returns list of newly created jobs.
 */
export async function GET() {
  const files = scanInputFolder();
  const rows = db.prepare('SELECT input_file FROM jobs WHERE input_file IS NOT NULL').all() as Array<{ input_file: string | null }>;
  const existingInputs = new Set(rows.map((r) => r.input_file).filter(Boolean) as string[]);

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

  return NextResponse.json({ created, scanned: files.length });
}
