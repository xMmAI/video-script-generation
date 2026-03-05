import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import db from '@/lib/db';
import {
  readScriptByPath,
  createJobOutputDir,
  parseScriptMdToSegments,
  segmentToAudioFilename,
} from '@/lib/files';
import { textToSpeech } from '@/lib/elevenlabs';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/jobs/[id]/audio
 * Generates TTS per segment; only narrative text is sent to ElevenLabs (timestamp headers stripped).
 * Saves one file per segment as output/[jobId]/{start}-{end}.mp3 (e.g. 0.0-5.9.mp3).
 * Query: ?limit=N to generate only the first N segments (e.g. ?limit=2 for testing).
 */
export async function POST(request: Request, context: RouteContext) {
  const { id: jobId } = await context.params;
  let limit: number | undefined;
  let offset = 0;
  try {
    const urlForParams =
      request.url.startsWith('http') ? request.url : `http://localhost:3000${request.url}`;
    const url = new URL(urlForParams);
    const limitParam = url.searchParams.get('limit');
    if (limitParam) limit = Math.max(1, parseInt(limitParam, 10));
    const offsetParam = url.searchParams.get('offset');
    if (offsetParam) offset = Math.max(0, parseInt(offsetParam, 10) || 0);
  } catch {
    // ignore URL parse errors
  }
  if (limit === undefined) {
    const headerLimit = request.headers.get('x-audio-limit');
    if (headerLimit) {
      const n = parseInt(headerLimit, 10);
      if (Number.isInteger(n) && n >= 1) limit = n;
    }
  }
  const headerOffset = request.headers.get('x-audio-offset');
  if (headerOffset) {
    const n = parseInt(headerOffset, 10);
    if (Number.isInteger(n) && n >= 0) offset = n;
  }
  if (limit === undefined) {
    try {
      const body = (await request.json()) as { limit?: number; offset?: number } | undefined;
      if (typeof body?.limit === 'number' && body.limit >= 1) limit = body.limit;
      if (typeof body?.offset === 'number' && body.offset >= 0) offset = body.offset;
    } catch {
      // no body or invalid JSON
    }
  }

  const row = db.prepare('SELECT id, script_path, input_file FROM jobs WHERE id = ?').get(jobId) as
    | { id: string; script_path: string | null; input_file: string | null }
    | undefined;
  if (!row) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }
  if (!row.script_path) {
    return NextResponse.json(
      { error: 'No script yet. Process the video first to generate a script.' },
      { status: 400 }
    );
  }

  const scriptContent = readScriptByPath(row.script_path);
  if (!scriptContent) {
    return NextResponse.json(
      { error: 'Script file not found. Re-run Process to regenerate the script.' },
      { status: 400 }
    );
  }

  const segments = parseScriptMdToSegments(scriptContent);
  const safeOffset = Math.min(Math.max(0, offset), Math.max(0, segments.length - 1));
  const endIndex =
    limit !== undefined ? Math.min(safeOffset + limit, segments.length) : segments.length;
  const toProcess = segments.slice(safeOffset, endIndex);
  if (toProcess.length === 0) {
    return NextResponse.json({ error: 'Script has no segments to speak.' }, { status: 400 });
  }

  const now = new Date().toISOString();
  db.prepare('UPDATE jobs SET status = ?, updated_at = ? WHERE id = ?').run('synthesizing', now, jobId);

  try {
    const dir = createJobOutputDir(jobId);
    const writtenPaths: string[] = [];

    for (const segment of toProcess) {
      const audioBuffer = await textToSpeech(segment.text);
      const fileName = segmentToAudioFilename(segment);
      const audioPath = path.join(dir, fileName);
      fs.writeFileSync(audioPath, audioBuffer);
      writtenPaths.push(`${jobId}/${fileName}`);
    }

    const firstPath = writtenPaths[0];
    db.prepare(
      'UPDATE jobs SET status = ?, audio_path = ?, updated_at = ? WHERE id = ?'
    ).run('done', firstPath, new Date().toISOString(), jobId);

    return NextResponse.json({
      ok: true,
      jobId,
      audio_path: firstPath,
      segments_generated: writtenPaths.length,
      segment_files: writtenPaths,
      status: 'approved',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Audio generation failed';
    console.error('[POST /api/jobs/[id]/audio]', jobId, err);
    db.prepare('UPDATE jobs SET status = ?, updated_at = ? WHERE id = ?').run(
      'review',
      new Date().toISOString(),
      jobId
    );
    return NextResponse.json(
      { error: 'Audio generation failed', details: message },
      { status: 500 }
    );
  }
}
