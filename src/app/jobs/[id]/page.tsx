'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { Job } from '@/types';

/** Client-side segment with index, times, narrative text, and audio URL. */
type SegmentRow = {
  index: number;
  start: number;
  end: number;
  text: string;
  audioUrl: string;
};

const SEGMENT_HEADER_REGEX = /^##\s*(\d+(?:\.\d+)?)s\s*[–-]\s*(\d+(?:\.\d+)?)s\s*$/m;

function parseScriptMdToSegmentsClient(md: string): { start: number; end: number; text: string }[] {
  const segments: { start: number; end: number; text: string }[] = [];
  const blocks = md.split(/\n(?=## \d)/);
  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    const firstLineEnd = trimmed.indexOf('\n');
    const firstLine = firstLineEnd >= 0 ? trimmed.slice(0, firstLineEnd).trim() : trimmed;
    const match = firstLine.match(SEGMENT_HEADER_REGEX);
    if (!match) continue;
    const start = parseFloat(match[1]);
    const end = parseFloat(match[2]);
    const text = firstLineEnd >= 0 ? trimmed.slice(firstLineEnd + 1).trim() : '';
    if (Number.isFinite(start) && Number.isFinite(end)) {
      segments.push({ start, end, text });
    }
  }
  return segments;
}

function statusBadgeVariant(
  status: Job['status']
): 'pending' | 'transcribing' | 'review' | 'approved' | 'failed' | 'default' {
  if (status === 'pending') return 'pending';
  if (status === 'transcribing') return 'transcribing';
  if (status === 'review') return 'review';
  if (
    status === 'approved' ||
    status === 'done' ||
    status === 'synthesizing' ||
    status === 'rendering' ||
    status === 'rendered'
  )
    return 'approved';
  if (status === 'failed') return 'failed';
  return 'default';
}

export default function JobDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);
  const [deletingVideo, setDeletingVideo] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [generatingAudio, setGeneratingAudio] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [segments, setSegments] = useState<SegmentRow[] | null>(null);
  const [loadingSegments, setLoadingSegments] = useState(false);
  /** Per-segment draft text for inline editing (index -> draft). */
  const [draftText, setDraftText] = useState<Record<number, string>>({});
  const [savingIndex, setSavingIndex] = useState<number | null>(null);
  const [regeneratingIndex, setRegeneratingIndex] = useState<number | null>(null);
  /** Cache-bust key per segment after regeneration so audio player refetches. */
  const [audioKey, setAudioKey] = useState<Record<number, number>>({});

  useEffect(() => {
    if (!id) return;
    fetch(`/api/jobs/${id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then(setJob)
      .finally(() => setLoading(false));
  }, [id]);

  const loadSegments = useCallback(async () => {
    if (!job?.id || !job.script_path) return;
    setLoadingSegments(true);
    try {
      const res = await fetch(`/api/output/${job.script_path}`);
      const md = res.ok ? await res.text() : null;
      if (!md) {
        setSegments(null);
        return;
      }
      const parsed = parseScriptMdToSegmentsClient(md);
      const outputFolderId = job.script_path.split('/')[0] ?? job.id;
      const rows: SegmentRow[] = parsed.map((seg, i) => ({
        index: i,
        start: seg.start,
        end: seg.end,
        text: seg.text,
        audioUrl: `/api/output/${outputFolderId}/${seg.start.toFixed(1)}-${seg.end.toFixed(1)}.mp3`,
      }));
      setSegments(rows);
    } finally {
      setLoadingSegments(false);
    }
  }, [job?.id, job?.script_path]);

  useEffect(() => {
    if (!job?.id || !job.script_path) {
      setSegments(null);
      return;
    }
    loadSegments();
  }, [job?.id, job?.script_path, loadSegments]);

  async function handleSaveSegment(index: number, text: string) {
    if (!id) return;
    setSavingIndex(index);
    try {
      const res = await fetch(`/api/jobs/${id}/script/segment`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index, text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error ?? 'Failed to save segment');
        return;
      }
      setDraftText((prev) => {
        const next = { ...prev };
        delete next[index];
        return next;
      });
      await loadSegments();
    } finally {
      setSavingIndex(null);
    }
  }

  async function handleRegenerateSegment(index: number) {
    if (!id) return;
    setRegeneratingIndex(index);
    try {
      const res = await fetch(
        `/api/jobs/${id}/audio?offset=${index}&limit=1`,
        { method: 'POST' }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.details ?? data.error ?? 'Regenerate failed');
        return;
      }
      setAudioKey((prev) => ({ ...prev, [index]: Date.now() }));
    } finally {
      setRegeneratingIndex(null);
    }
  }

  useEffect(() => {
    if (!job?.id) return;
    if (job.status !== 'rendering') return;

    const interval = setInterval(async () => {
      const res = await fetch(`/api/jobs/${job.id}`);
      if (!res.ok) return;
      const data = (await res.json()) as Job;
      setJob(data);
      if (data.status !== 'rendering') {
        clearInterval(interval);
        setRendering(false);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [job?.id, job?.status]);

  async function handleDeleteVideo() {
    if (!id) return;
    if (!confirm('Delete the video file from /input? You can re-upload the same filename and Process again.')) return;
    setDeletingVideo(true);
    try {
      const res = await fetch(`/api/jobs/${id}/video`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error ?? 'Failed to delete video');
        return;
      }
      const jobRes = await fetch(`/api/jobs/${id}`);
      const jobData = await jobRes.json();
      setJob(jobData);
      setSegments(null);
    } finally {
      setDeletingVideo(false);
    }
  }

  async function handleProcess() {
    if (!id) return;
    setProcessing(true);
    try {
      const res = await fetch('/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.details ?? data.error ?? 'Process failed');
        return;
      }
      const jobRes = await fetch(`/api/jobs/${id}`);
      const jobData = await jobRes.json();
      setJob(jobData);
    } finally {
      setProcessing(false);
    }
  }

  async function handleApprove() {
    if (!id) return;
    setApproving(true);
    try {
      await fetch(`/api/jobs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved' }),
      });
      const res = await fetch(`/api/jobs/${id}`);
      const data = await res.json();
      setJob(data);
    } finally {
      setApproving(false);
    }
  }

  async function handleGenerateAudio() {
    if (!id) return;
    setGeneratingAudio(true);
    try {
      const res = await fetch(`/api/jobs/${id}/audio`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(`Audio failed: ${data.details ?? data.error ?? res.status}`);
      }
      const jobRes = await fetch(`/api/jobs/${id}`);
      const jobData = await jobRes.json();
      setJob(jobData);
    } finally {
      setGeneratingAudio(false);
    }
  }

  async function handleRenderVideo() {
    if (!id) return;
    setRendering(true);
    try {
      const res = await fetch('/api/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(`Render failed: ${data.details ?? data.error ?? res.status}`);
      }
      const jobRes = await fetch(`/api/jobs/${id}`);
      const jobData = await jobRes.json();
      setJob(jobData);
    } finally {
      setRendering(false);
    }
  }

  if (loading) {
    return (
      <main className="p-6">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </main>
    );
  }

  if (!job) {
    return (
      <main className="p-6">
        <p className="text-sm text-muted-foreground">Job not found.</p>
        <Link href="/" className="mt-2 inline-block text-sm text-primary hover:underline">
          Back to dashboard
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto max-w-2xl">
        <Link href="/" className="text-sm text-primary hover:underline">
          ← Back to dashboard
        </Link>
        <h1 className="mt-4 text-2xl font-semibold">{job.title ?? job.input_file ?? job.id}</h1>
        <Badge variant={statusBadgeVariant(job.status)} className="mt-2">
          {job.status}
        </Badge>
        {job.input_file && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <p className="text-sm text-muted-foreground">Input file: {job.input_file}</p>
            <Button
              variant="outline"
              size="sm"
              disabled={deletingVideo}
              onClick={handleDeleteVideo}
            >
              {deletingVideo ? 'Deleting…' : 'Delete Video'}
            </Button>
          </div>
        )}

        {(job.status === 'pending' || job.status === 'failed') && (
          <div className="mt-6 rounded-lg border border-border bg-muted/50 p-4">
            <p className="text-sm text-muted-foreground">
              {job.status === 'failed'
                ? 'Processing failed. Fix any issues and retry.'
                : 'Upload the video to the /input folder, then run Process to generate the script.'}
            </p>
            <Button
              onClick={handleProcess}
              disabled={processing}
              className="mt-4"
            >
              {processing ? 'Processing…' : job.status === 'failed' ? 'Retry' : 'Process'}
            </Button>
          </div>
        )}

        {job.status === 'review' && (
          <div className="mt-6 rounded-lg border border-border bg-muted/50 p-4">
            <p className="text-sm">
              Script ready — open <code className="rounded bg-muted px-1">/output/{job.script_path ?? `${job.id}/script.md`}</code> in your
              editor to review.
            </p>
            <Button onClick={handleApprove} disabled={approving} className="mt-4">
              {approving ? 'Approving…' : 'Approve Script'}
            </Button>
          </div>
        )}

        {(job.status === 'review' ||
          job.status === 'approved' ||
          job.status === 'done' ||
          job.status === 'rendering' ||
          job.status === 'rendered') &&
          job.script_path && (
          <div className="mt-6 rounded-lg border border-border bg-muted/50 p-4">
            <p className="text-sm font-medium">Script &amp; audio (inline edit, then regenerate per segment)</p>
            {job.audio_path ? (
              <div className="mt-2 space-y-2">
                {loadingSegments && (
                  <p className="text-xs text-muted-foreground">Loading segments…</p>
                )}
                {segments && segments.length > 0 && (
                  <div className="max-h-[28rem] space-y-3 overflow-y-auto pr-1">
                    {segments.map((seg) => {
                      const displayText = draftText[seg.index] ?? seg.text;
                      const hasDraft = draftText[seg.index] !== undefined && draftText[seg.index] !== seg.text;
                      const audioSrc = `${seg.audioUrl}${audioKey[seg.index] ? `?t=${audioKey[seg.index]}` : ''}`;
                      return (
                        <div
                          key={`${seg.index}-${seg.start}-${seg.end}`}
                          className="rounded border border-border/60 bg-background/80 p-2 space-y-1.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="whitespace-nowrap text-xs font-medium text-muted-foreground">
                              {seg.start.toFixed(1)}s – {seg.end.toFixed(1)}s
                            </span>
                            <div className="flex gap-1">
                              {hasDraft && (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  disabled={savingIndex === seg.index}
                                  onClick={() => handleSaveSegment(seg.index, draftText[seg.index] ?? seg.text)}
                                >
                                  {savingIndex === seg.index ? 'Saving…' : 'Save'}
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={regeneratingIndex === seg.index}
                                onClick={() => handleRegenerateSegment(seg.index)}
                              >
                                {regeneratingIndex === seg.index ? '…' : 'Regenerate audio'}
                              </Button>
                            </div>
                          </div>
                          <textarea
                            className="w-full min-h-10 resize-y rounded border border-input bg-background px-2 py-1.5 text-sm"
                            rows={2}
                            value={displayText}
                            onChange={(e) =>
                              setDraftText((prev) => ({ ...prev, [seg.index]: e.target.value }))
                            }
                            placeholder="Narrative text for this segment"
                          />
                          <audio
                            key={audioSrc}
                            controls
                            src={audioSrc}
                            className="h-7 w-full max-w-md"
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
                {!loadingSegments && (!segments || segments.length === 0) && (
                  <p className="text-xs text-muted-foreground">
                    No segments in script yet, or script not found.
                  </p>
                )}
              </div>
            ) : (
              <Button
                onClick={handleGenerateAudio}
                disabled={generatingAudio || (job as Job).status === 'synthesizing'}
                className="mt-2"
              >
                {generatingAudio || (job as Job).status === 'synthesizing' ? 'Generating…' : 'Generate audio'}
              </Button>
            )}
          </div>
        )}

        {job.status === 'done' && (
          <div className="mt-6 rounded-lg border border-border bg-muted/50 p-4">
            <p className="text-sm font-medium">Final video</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Audio is ready. Stitch the avatar intro/outro with the screen recording into a final
              MP4.
            </p>
            <Button
              onClick={handleRenderVideo}
              disabled={rendering}
              className="mt-4"
            >
              {rendering ? 'Rendering…' : '🎬 Render Final Video'}
            </Button>
          </div>
        )}

        {job.status === 'rendering' && (
          <div className="mt-6 rounded-lg border border-border bg-muted/50 p-4">
            <p className="text-sm font-medium">Rendering video…</p>
            <p className="mt-1 text-sm text-muted-foreground">
              We&apos;re stitching the avatar intro/outro with your screen recording. This may take
              a moment.
            </p>
          </div>
        )}

        {job.status === 'rendered' && job.final_video_path && (
          <div className="mt-6 rounded-lg border border-border bg-muted/50 p-4 space-y-3">
            <p className="text-sm font-medium">Final video</p>
            <p className="text-sm text-muted-foreground">Your video is ready to watch or download.</p>
            <video
              controls
              className="mt-2 w-full rounded border border-border bg-black"
              src={`/api/output/${job.final_video_path}`}
            />
            <a
              href={`/api/output/${job.final_video_path}`}
              download
              className="inline-flex"
            >
              <Button variant="outline">Download MP4</Button>
            </a>
          </div>
        )}
      </div>
    </main>
  );
}
