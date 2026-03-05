import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { ensureDirs, INPUT_DIR } from '@/lib/files';

/** Allowed video extensions for input upload (must match scan expectations for .mov). */
const ALLOWED_EXT = ['.mov', '.MOV', '.mp4', '.MP4'];

/**
 * POST /api/upload
 * Accepts multipart/form-data with field "file". Saves the file to the input folder
 * and returns the stored filename. After upload, client should call GET /api/scan to register the job.
 */
export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid multipart body' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'Missing or invalid file field' }, { status: 400 });
  }

  const ext = path.extname(file.name);
  if (!ALLOWED_EXT.includes(ext)) {
    return NextResponse.json(
      { error: `Unsupported format. Use .mov or .mp4 (got ${ext})` },
      { status: 400 }
    );
  }

  ensureDirs();
  const filename = path.basename(file.name);
  const destPath = path.join(INPUT_DIR, filename);

  try {
    const bytes = await file.arrayBuffer();
    fs.writeFileSync(destPath, Buffer.from(bytes));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Write failed';
    return NextResponse.json({ error: `Save failed: ${message}` }, { status: 500 });
  }

  return NextResponse.json({ filename });
}
