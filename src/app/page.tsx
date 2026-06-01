'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import type { Job } from '@/types';

const ALLOWED_VIDEO_TYPES = ['.mov', '.mp4'];

function isAllowedFile(file: File): boolean {
  return ALLOWED_VIDEO_TYPES.some((ext) => file.name.toLowerCase().endsWith(ext));
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

const STATUS_CFG: Record<string, { bg: string; text: string; dot: string }> = {
  pending:      { bg: '#fef3c7', text: '#92400e', dot: '#f59e0b' },
  transcribing: { bg: '#dbeafe', text: '#1e40af', dot: '#3b82f6' },
  review:       { bg: '#fce7f3', text: '#9d174d', dot: '#e87fa0' },
  approved:     { bg: '#d1fae5', text: '#065f46', dot: '#10b981' },
  synthesizing: { bg: '#ede9fe', text: '#5b21b6', dot: '#8b5cf6' },
  done:         { bg: '#d1fae5', text: '#065f46', dot: '#10b981' },
  rendering:    { bg: '#ede9fe', text: '#5b21b6', dot: '#8b5cf6' },
  rendered:     { bg: '#d1fae5', text: '#065f46', dot: '#10b981' },
  failed:       { bg: '#fee2e2', text: '#991b1b', dot: '#ef4444' },
};

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_CFG[status] ?? { bg: '#f3f4f6', text: '#374151', dot: '#9ca3af' };
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ backgroundColor: c.bg, color: c.text }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: c.dot }} />
      {status}
    </span>
  );
}

type UploadStatus = 'idle' | 'uploading' | 'success' | 'error';

function VideoDropZone({ onUploadComplete, disabled }: { onUploadComplete: () => void; disabled: boolean }) {
  const [dragActive, setDragActive] = useState(false);
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const uploadFile = useCallback(async (file: File) => {
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
  }, [onUploadComplete]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (disabled || status === 'uploading') return;
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  }, [disabled, status, uploadFile]);

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

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    e.target.value = '';
  }, [uploadFile]);

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={() => status !== 'uploading' && !disabled && inputRef.current?.click()}
      className="cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition-all"
      style={{
        borderColor: dragActive ? '#1a1f5e' : '#c8b89a',
        backgroundColor: dragActive ? '#ede8dc' : '#f0ebdf',
        opacity: disabled || status === 'uploading' ? 0.6 : 1,
        pointerEvents: disabled || status === 'uploading' ? 'none' : 'auto',
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".mov,.MOV,.mp4,.MP4,video/quicktime,video/mp4"
        onChange={handleChange}
        className="hidden"
      />
      <div
        className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full"
        style={{ backgroundColor: '#1a1f5e' }}
      >
        <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
        </svg>
      </div>

      {status === 'uploading' && <p className="text-sm font-medium" style={{ color: '#1a1f5e' }}>Uploading…</p>}
      {status === 'success' && message && <p className="text-sm font-medium text-emerald-700">{message}</p>}
      {status === 'error' && message && <p className="text-sm font-medium text-red-600">{message}</p>}

      {(status === 'idle' || status === 'success' || status === 'error') && (
        <>
          <p className="text-sm font-medium" style={{ color: '#1a1f5e' }}>
            {dragActive ? 'Drop it!' : 'Drop a .MOV or .MP4 here'}
          </p>
          <p className="mt-1 text-xs" style={{ color: '#9a8e7e' }}>or click anywhere to choose a file</p>
        </>
      )}
    </div>
  );
}

const HELP_STEPS = [
  {
    n: '1',
    title: 'Upload your screen recording',
    body: 'Drop a .MOV or .MP4 into the upload zone above, or place files directly in the /input folder and click "Scan for new files".',
  },
  {
    n: '2',
    title: 'Process — generate the script',
    body: 'Click "Process" on any pending job. Gemini AI watches your screen recording and writes a timestamped narration script, one segment per scene.',
  },
  {
    n: '3',
    title: 'Review & edit the script',
    body: 'Open the job to see each segment alongside the video. Click a timestamp to jump to that moment. Edit text inline, or use "Polish with AI" to improve the phrasing.',
  },
  {
    n: '4',
    title: 'Approve & generate audio',
    body: 'Happy with the script? Click "Approve Script", then "Generate Audio". ElevenLabs converts each segment to speech. You can regenerate individual segments if needed.',
  },
  {
    n: '5',
    title: 'Render the final video',
    body: 'Click "Render Final Video". FFmpeg stitches your screen recording with the avatar intro/outro overlay and the generated audio into a finished MP4 ready to download.',
  },
];

function HelpSection() {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-2xl border overflow-hidden" style={{ borderColor: '#e8e0d0', backgroundColor: 'white' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-amber-50"
      >
        <div className="flex items-center gap-2.5">
          <span className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white" style={{ backgroundColor: '#1a1f5e' }}>?</span>
          <span className="text-sm font-semibold" style={{ color: '#1a1f5e' }}>How does Narri work?</span>
        </div>
        <svg
          className="h-4 w-4 shrink-0 transition-transform"
          style={{ color: '#9a8e7e', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="border-t px-5 pb-5 pt-4" style={{ borderColor: '#e8e0d0' }}>
          <ol className="space-y-4">
            {HELP_STEPS.map((step) => (
              <li key={step.n} className="flex gap-3">
                <span
                  className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ backgroundColor: '#e8a020' }}
                >
                  {step.n}
                </span>
                <div>
                  <p className="text-sm font-semibold" style={{ color: '#1a1f5e' }}>{step.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed" style={{ color: '#7a6e5e' }}>{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-4 rounded-lg px-3 py-2 text-xs" style={{ backgroundColor: '#fef3c7', color: '#92400e' }}>
            <strong>Tip:</strong> FFmpeg and ffprobe must be installed (<code>brew install ffmpeg</code>), and your <code>.env.local</code> needs a Gemini and ElevenLabs API key.
          </p>
        </div>
      )}
    </div>
  );
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

  useEffect(() => { refresh(); }, []);

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

  const total = jobs.length;
  const inReview = jobs.filter((j) => j.status === 'review' || j.status === 'approved').length;
  const done = jobs.filter((j) => j.status === 'done' || j.status === 'rendered').length;
  const failed = jobs.filter((j) => j.status === 'failed').length;

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#faf8f2' }}>

      {/* Header */}
      <header className="sticky top-0 z-10 shadow-md" style={{ backgroundColor: '#1a1f5e' }}>
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <img src="/cat-white.png" alt="Narri" className="h-[60px] w-[60px] object-contain" />
            <div className="leading-tight">
              <p className="text-lg font-bold text-white">Narri</p>
              <p className="text-xs font-medium" style={{ color: '#e8a020' }}>Script &amp; Audio Generator</p>
            </div>
          </div>
          <button
            onClick={refresh}
            disabled={loading}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 transition-opacity"
            style={{ backgroundColor: '#e8a020' }}
          >
            {loading ? 'Scanning…' : 'Scan for new files'}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8 space-y-6">

        {/* Upload */}
        <VideoDropZone onUploadComplete={refresh} disabled={loading} />

        {/* Stats cards */}
        {total > 0 && (
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Total',     value: total,    color: '#1a1f5e' },
              { label: 'In Review', value: inReview, color: '#e87fa0' },
              { label: 'Done',      value: done,     color: '#059669' },
              { label: 'Failed',    value: failed,   color: '#dc2626' },
            ].map((stat) => (
              <div key={stat.label} className="rounded-xl border bg-white px-4 py-3 shadow-sm" style={{ borderColor: '#e8e0d0' }}>
                <p className="text-2xl font-bold" style={{ color: stat.color }}>{stat.value}</p>
                <p className="text-xs" style={{ color: '#9a8e7e' }}>{stat.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Help */}
        <HelpSection />

        {/* Jobs */}
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide" style={{ color: '#9a8e7e' }}>
            Your videos
          </p>

          {!loading && jobs.length === 0 && (
            <div className="rounded-2xl border border-dashed py-10 text-center" style={{ borderColor: '#c8b89a' }}>
              <p className="text-sm" style={{ color: '#9a8e7e' }}>No videos yet. Upload one above to get started.</p>
            </div>
          )}

          <div className="space-y-2">
            {jobs.map((job) => (
              <div
                key={job.id}
                className="flex items-center justify-between rounded-xl border bg-white px-5 py-4 shadow-sm"
                style={{ borderColor: '#e8e0d0' }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                    style={{ backgroundColor: '#f0ebdf' }}
                  >
                    <svg className="h-4 w-4" style={{ color: '#1a1f5e' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.361a1 1 0 01-1.447.894L15 14M3 8.5A1.5 1.5 0 014.5 7h8A1.5 1.5 0 0114 8.5v7A1.5 1.5 0 0112.5 17h-8A1.5 1.5 0 013 15.5v-7z" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium" style={{ color: '#1a1f5e' }}>
                      {job.input_file ?? job.title ?? job.id}
                    </p>
                    <p className="text-xs" style={{ color: '#9a8e7e' }}>{formatDate(job.created_at)}</p>
                  </div>
                </div>

                <div className="ml-4 flex shrink-0 items-center gap-3">
                  <StatusBadge status={job.status} />
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
                    className="rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-amber-50"
                    style={{ borderColor: '#1a1f5e', color: '#1a1f5e' }}
                  >
                    View →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
