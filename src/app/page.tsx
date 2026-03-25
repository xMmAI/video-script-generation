'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { Job } from '@/types';

const ALLOWED_VIDEO_TYPES = ['.mov', '.mp4'];

function isAllowedFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return ALLOWED_VIDEO_TYPES.some((ext) => name.endsWith(ext));
}

type UploadStatus = 'idle' | 'uploading' | 'success' | 'error';

function VideoDropZone({
  onUploadComplete,
  disabled,
}: {
  onUploadComplete: () => void;
  disabled: boolean;
}) {
  const [dragActive, setDragActive] = useState(false);
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const uploadFile = useCallback(
    async (file: File) => {
      if (!isAllowedFile(file)) {
        setStatus('error');
        setMessage('Please use a .MOV or .MP4 file.');
        return;
      }
      setStatus('uploading');
      setMessage(null);
      try {
        const form = new FormData();
        form.append('file', file);
        const res = await fetch('/api/upload', { method: 'POST', body: form });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setStatus('error');
          setMessage(data.error ?? `Upload failed (${res.status})`);
          return;
        }
        setStatus('success');
        setMessage(`Saved as ${data.filename ?? file.name}`);
        onUploadComplete();
      } catch (err) {
        setStatus('error');
        setMessage(err instanceof Error ? err.message : 'Upload failed');
      }
    },
    [onUploadComplete]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      if (disabled || status === 'uploading') return;
      const file = e.dataTransfer.files?.[0];
      if (file) uploadFile(file);
    },
    [disabled, status, uploadFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) uploadFile(file);
      e.target.value = '';
    },
    [uploadFile]
  );

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={`rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
        dragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 bg-muted/30'
      } ${disabled || status === 'uploading' ? 'pointer-events-none opacity-60' : ''}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".mov,.MOV,.mp4,.MP4,video/quicktime,video/mp4"
        onChange={handleChange}
        className="hidden"
      />
      {status === 'uploading' && (
        <p className="text-sm text-muted-foreground">Uploading…</p>
      )}
      {status === 'success' && message && (
        <p className="text-sm text-green-600 dark:text-green-400">{message}</p>
      )}
      {status === 'error' && message && (
        <p className="text-sm text-destructive">{message}</p>
      )}
      {(status === 'idle' || status === 'success' || status === 'error') && (
        <>
          <p className="text-sm text-muted-foreground">
            {dragActive ? 'Drop video here' : 'Drag and drop a .MOV or .MP4 here, or'}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => inputRef.current?.click()}
          >
            Choose file
          </Button>
        </>
      )}
    </div>
  );
}

function statusBadgeVariant(
  status: Job['status']
): 'pending' | 'transcribing' | 'review' | 'approved' | 'failed' | 'default' {
  if (status === 'pending') return 'pending';
  if (status === 'transcribing') return 'transcribing';
  if (status === 'review') return 'review';
  if (status === 'approved' || status === 'done' || status === 'synthesizing' || status === 'rendering') return 'approved';
  if (status === 'failed') return 'failed';
  return 'default';
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function Page() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      await fetch('/api/scan');
      const res = await fetch('/api/jobs');
      const data = await res.json();
      setJobs(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleProcess(job: Job) {
    setProcessing(job.id);
    const isRenderRetry = !!job.script_path && !!job.audio_path;
    try {
      const url = isRenderRetry ? '/api/render' : '/api/process';
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: job.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data.details ?? data.error ?? `Request failed (${res.status})`;
        alert(`${isRenderRetry ? 'Render' : 'Process'} failed: ${msg}`);
      }
      await refresh();
    } finally {
      setProcessing(null);
    }
  }

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-2xl font-semibold">Narri: Script & Audio Generator</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload a video to generate a script and audio.
        </p>

        <div className="mt-4">
          <VideoDropZone onUploadComplete={refresh} disabled={loading} />
        </div>

        <Button onClick={refresh} disabled={loading} className="mt-4" variant="outline">
          {loading ? 'Loading…' : 'Scan for new videos'}
        </Button>
        <p className="mt-1 text-xs text-muted-foreground">
          Use this if you dropped files directly into the <code>/input</code> folder outside the browser.
        </p>

        <div className="mt-6 space-y-4">
          {jobs.length === 0 && !loading && (
            <p className="text-sm text-muted-foreground">No jobs yet. Upload a video above or add files to /input and click Scan.</p>
          )}
          {jobs.map((job) => (
            <Card key={job.id}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-base font-medium">
                  {job.input_file ?? job.title ?? job.id}
                </CardTitle>
                <Badge variant={statusBadgeVariant(job.status)}>{job.status}</Badge>
              </CardHeader>
              <CardContent className="flex flex-row items-center justify-between gap-4">
                <span className="text-xs text-muted-foreground">{formatDate(job.created_at)}</span>
                <div className="flex gap-2">
                  {(job.status === 'pending' || job.status === 'failed') && (
                    <Button
                      size="sm"
                      variant={job.status === 'failed' ? 'outline' : 'default'}
                      disabled={processing === job.id}
                      onClick={() => handleProcess(job)}
                    >
                      {processing === job.id ? 'Processing…' : job.status === 'failed' ? 'Retry' : 'Process'}
                    </Button>
                  )}
                  <Link
                    href={`/jobs/${job.id}`}
                    className="inline-flex h-8 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
                  >
                    View
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </main>
  );
}
