import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { OUTPUT_DIR } from '@/lib/files';

/**
 * GET /api/output/[jobId]/[filename]
 * Serves files from the output directory (e.g. audio) so the browser can play them.
 * Path is constrained to OUTPUT_DIR to avoid traversal.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ path?: string[] }> }
) {
  const pathSegments = (await context.params).path;
  if (!pathSegments?.length) {
    return NextResponse.json({ error: 'Path required' }, { status: 400 });
  }
  const resolved = path.join(OUTPUT_DIR, ...pathSegments);
  const realOut = path.resolve(OUTPUT_DIR);
  if (!resolved.startsWith(realOut) || resolved === realOut) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const buf = fs.readFileSync(resolved);
  const ext = path.extname(resolved).toLowerCase();
  const mime =
    ext === '.mp3'
      ? 'audio/mpeg'
      : ext === '.md'
      ? 'text/markdown'
      : ext === '.mp4'
      ? 'video/mp4'
      :
    'application/octet-stream';
  return new NextResponse(buf, {
    headers: { 'Content-Type': mime },
  });
}
