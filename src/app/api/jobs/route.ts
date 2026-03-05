import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import db from '@/lib/db';
import type { Job } from '@/types';

function rowToJob(row: Record<string, unknown>): Job {
  return {
    id: row.id as string,
    title: (row.title as string) ?? null,
    status: row.status as Job['status'],
    input_file: (row.input_file as string) ?? null,
    script_path: (row.script_path as string) ?? null,
    audio_path: (row.audio_path as string) ?? null,
    avatar_intro_path: (row.avatar_intro_path as string) ?? null,
    avatar_outro_path: (row.avatar_outro_path as string) ?? null,
    final_video_path: (row.final_video_path as string) ?? null,
    youtube_url: (row.youtube_url as string) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

/**
 * GET /api/jobs
 * Returns all jobs ordered by created_at desc.
 */
export async function GET() {
  const rows = db
    .prepare(
      'SELECT id, title, status, input_file, script_path, audio_path, avatar_intro_path, avatar_outro_path, final_video_path, youtube_url, created_at, updated_at FROM jobs ORDER BY created_at DESC'
    )
    .all() as Record<string, unknown>[];
  const jobs = rows.map(rowToJob);
  return NextResponse.json(jobs);
}

/**
 * POST /api/jobs
 * Create a new job.
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const id = (body.id as string) ?? uuidv4();
  const title = typeof body.title === 'string' ? body.title : null;
  const status = (typeof body.status === 'string' ? body.status : 'pending') as Job['status'];
  const input_file = typeof body.input_file === 'string' ? body.input_file : null;
  const now = new Date().toISOString();

  try {
    db.prepare(
      `INSERT INTO jobs (id, title, status, input_file, script_path, audio_path, avatar_intro_path, avatar_outro_path, final_video_path, youtube_url, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, title, status, input_file, null, null, null, null, null, null, now, now);
  } catch (err) {
    return NextResponse.json({ error: 'Failed to create job' }, { status: 500 });
  }

  const row = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as Record<string, unknown>;
  return NextResponse.json(rowToJob(row), { status: 201 });
}
