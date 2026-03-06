import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { findJobIdByInputFile, rehydrateJobFromDisk } from '@/lib/files';
import type { Job, JobStatus } from '@/types';

type RouteContext = { params: Promise<{ id: string }> };

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
 * GET /api/jobs/[id]
 * Returns a single job by id. Rehydrates from disk if DB says pending but output exists.
 */
export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  let row = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!row) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }
  if (row.status === 'pending' && !row.script_path && row.input_file) {
    const outputFolderId = findJobIdByInputFile(row.input_file as string) ?? id;
    const rehydrated = rehydrateJobFromDisk(outputFolderId);
    if (rehydrated) {
      const now = new Date().toISOString();
      db.prepare(
        'UPDATE jobs SET status = ?, script_path = ?, audio_path = ?, final_video_path = ?, updated_at = ? WHERE id = ?'
      ).run(
        rehydrated.status,
        rehydrated.script_path,
        rehydrated.audio_path,
        rehydrated.final_video_path ?? null,
        now,
        id
      );
      row = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as Record<string, unknown>;
    }
  }
  return NextResponse.json(rowToJob(row));
}

/**
 * PATCH /api/jobs/[id]
 * Update job fields (e.g. status, title).
 */
export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const row = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!row) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (body.status !== undefined && typeof body.status === 'string') updates.status = body.status as JobStatus;
  if (body.title !== undefined) updates.title = body.title === null || typeof body.title === 'string' ? body.title : row.title;
  if (body.input_file !== undefined) updates.input_file = body.input_file === null || typeof body.input_file === 'string' ? body.input_file : row.input_file;
  if (body.script_path !== undefined) updates.script_path = body.script_path === null || typeof body.script_path === 'string' ? body.script_path : row.script_path;

  const allowed = ['title', 'status', 'input_file', 'script_path', 'audio_path', 'avatar_intro_path', 'avatar_outro_path', 'final_video_path', 'youtube_url'];
  for (const key of allowed) {
    if (body[key] !== undefined) updates[key] = body[key];
  }

  const setClause = [...Object.keys(updates), 'updated_at'].map((k) => `${k} = ?`).join(', ');
  const values = [...Object.values(updates), new Date().toISOString(), id];
  db.prepare(`UPDATE jobs SET ${setClause} WHERE id = ?`).run(...values);

  const updated = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as Record<string, unknown>;
  return NextResponse.json(rowToJob(updated));
}
