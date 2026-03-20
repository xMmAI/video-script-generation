import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { INPUT_DIR } from '@/lib/files';

/**
 * GET /api/input/[...filename]
 * Serves files from the /input directory so the browser can play the original
 * screen recording in the side-by-side editor.
 * Path is constrained to INPUT_DIR to prevent traversal.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ filename: string[] }> }
) {
  const segments = (await context.params).filename;
  if (!segments?.length) {
    return NextResponse.json({ error: 'Filename required' }, { status: 400 });
  }

  const resolved = path.join(INPUT_DIR, ...segments);
  const realInput = path.resolve(INPUT_DIR);
  if (!resolved.startsWith(realInput) || resolved === realInput) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const ext = path.extname(resolved).toLowerCase();
  const mime =
    ext === '.mp4' ? 'video/mp4' :
    ext === '.mov' ? 'video/quicktime' :
    'application/octet-stream';

  const stat = fs.statSync(resolved);
  const fileSize = stat.size;

  // Support range requests so the browser can seek the video without
  // downloading the entire file first.
  const rangeHeader = _request.headers.get('range');
  if (rangeHeader) {
    const [startStr, endStr] = rangeHeader.replace('bytes=', '').split('-');
    const start = parseInt(startStr, 10);
    const end = endStr ? parseInt(endStr, 10) : fileSize - 1;
    const chunkSize = end - start + 1;

    const stream = fs.createReadStream(resolved, { start, end });
    const webStream = new ReadableStream({
      start(controller) {
        stream.on('data', (chunk) => controller.enqueue(chunk));
        stream.on('end', () => controller.close());
        stream.on('error', (err) => controller.error(err));
      },
    });

    return new NextResponse(webStream, {
      status: 206,
      headers: {
        'Content-Type': mime,
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(chunkSize),
      },
    });
  }

  // Full file response.
  const stream = fs.createReadStream(resolved);
  const webStream = new ReadableStream({
    start(controller) {
      stream.on('data', (chunk) => controller.enqueue(chunk));
      stream.on('end', () => controller.close());
      stream.on('error', (err) => controller.error(err));
    },
  });

  return new NextResponse(webStream, {
    headers: {
      'Content-Type': mime,
      'Content-Length': String(fileSize),
      'Accept-Ranges': 'bytes',
    },
  });
}
