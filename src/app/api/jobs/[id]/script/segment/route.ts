import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { patchSegmentText } from '@/lib/files';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * PATCH /api/jobs/[id]/script/segment
 * Body: { index: number, text: string }
 * Updates only the narrative text of the segment at the given index in script.md.
 * Script file is taken from the job's script_path.
 */
export async function PATCH(request: Request, context: RouteContext) {
  const { id: jobId } = await context.params;

  let body: { index?: number; text?: string };
  try {
    body = (await request.json()) as { index?: number; text?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const index = body.index;
  const text = body.text;

  if (typeof index !== 'number' || index < 0 || !Number.isInteger(index)) {
    return NextResponse.json({ error: 'index must be a non-negative integer' }, { status: 400 });
  }
  if (typeof text !== 'string') {
    return NextResponse.json({ error: 'text must be a string' }, { status: 400 });
  }

  const row = db
    .prepare('SELECT id, script_path FROM jobs WHERE id = ?')
    .get(jobId) as { id: string; script_path: string | null } | undefined;

  if (!row) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }
  if (!row.script_path) {
    return NextResponse.json(
      { error: 'Job has no script. Process the video first.' },
      { status: 400 }
    );
  }

  const ok = patchSegmentText(row.script_path, index, text);
  if (!ok) {
    return NextResponse.json(
      { error: 'Segment index out of range or script file not found' },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true, index, script_path: row.script_path });
}
