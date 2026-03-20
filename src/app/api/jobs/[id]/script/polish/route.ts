import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { polishSegmentText } from '@/lib/gemini';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/jobs/[id]/script/polish
 * Body: { index: number, text: string, start: number, end: number }
 *
 * Sends the segment text + available duration to Gemini for grammar/flow polish.
 * Returns: { suggestion: string }
 */
export async function POST(request: Request, context: RouteContext) {
  const { id: jobId } = await context.params;

  let body: { index?: number; text?: string; start?: number; end?: number };
  try {
    body = (await request.json()) as { index?: number; text?: string; start?: number; end?: number };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { index, text, start, end } = body;

  if (typeof index !== 'number' || index < 0 || !Number.isInteger(index)) {
    return NextResponse.json({ error: 'index must be a non-negative integer' }, { status: 400 });
  }
  if (typeof text !== 'string' || !text.trim()) {
    return NextResponse.json({ error: 'text must be a non-empty string' }, { status: 400 });
  }
  if (typeof start !== 'number' || typeof end !== 'number' || end <= start) {
    return NextResponse.json(
      { error: 'start and end must be valid timestamps with end > start' },
      { status: 400 }
    );
  }

  const row = db
    .prepare('SELECT id FROM jobs WHERE id = ?')
    .get(jobId) as { id: string } | undefined;

  if (!row) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  try {
    const suggestion = await polishSegmentText(text, end - start);
    return NextResponse.json({ suggestion });
  } catch (err) {
    const details = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'Polish failed', details }, { status: 500 });
  }
}
