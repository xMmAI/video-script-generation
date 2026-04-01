'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
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
  /**
   * Actual audio duration in seconds per segment, captured from the <audio> element's
   * onLoadedMetadata event. Used in the time budget indicator when audio exists.
   */
  const [audioDuration, setAudioDuration] = useState<Record<number, number>>({});
  /** Index of the segment currently being polished via AI. */
  const [polishingIndex, setPolishingIndex] = useState<number | null>(null);
  /** Per-segment AI polish suggestion, shown as before/after diff (index → suggestion). */
  const [polishSuggestion, setPolishSuggestion] = useState<Record<number, string>>({});

  /** Ref to the HTML5 video element for the input recording. */
  const videoRef = useRef<HTMLVideoElement>(null);
  /** Index of the segment whose time range contains the video's current time. */
  const [activeSegmentIndex, setActiveSegmentIndex] = useState<number>(-1);
  /** Refs to each rendered segment card div, keyed by segment index. */
  const segmentRefs = useRef<Map<number, HTMLDivElement>>(new Map());

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

  /**
   * Scroll the right panel to the newly active segment whenever it changes.
   * Uses 'nearest' block alignment so it only scrolls if the segment is out of view.
   */
  useEffect(() => {
    if (activeSegmentIndex < 0) return;
    const el = segmentRefs.current.get(activeSegmentIndex);
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [activeSegmentIndex]);

  /**
   * Called on every video timeupdate event.
   * Finds the segment whose [start, end) range contains the current playhead
   * and updates activeSegmentIndex when it changes.
   */
  function handleTimeUpdate() {
    if (!videoRef.current || !segments) return;
    const t = videoRef.current.currentTime;
    const idx = segments.findIndex((s) => t >= s.start && t < s.end);
    const next = idx >= 0 ? idx : -1;
    if (next !== activeSegmentIndex) {
      setActiveSegmentIndex(next);
    }
  }

  /**
   * Seek the input video to a segment's start time when the user clicks a segment card.
   * Propagation is left intact; interactive children (textarea, buttons) handle their
   * own events and won't cause unexpected seeks.
   */
  function seekToSegment(start: number) {
    if (!videoRef.current) return;
    videoRef.current.currentTime = start;
  }

  /**
   * Estimates how long `text` will take to speak at professional voiceover pace
   * (~150 words/min = 2.5 words/second).
   */
  function estimateSpeechSeconds(text: string): number {
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    return words / 2.5;
  }

  /** Send segment text to Gemini for grammar/flow polish and store the suggestion. */
  async function handlePolish(seg: SegmentRow) {
    if (!id) return;
    setPolishingIndex(seg.index);
    try {
      const res = await fetch(`/api/jobs/${id}/script/polish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          index: seg.index,
          text: draftText[seg.index] ?? seg.text,
          start: seg.start,
          end: seg.end,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error ?? 'Polish failed');
        return;
      }
      setPolishSuggestion((prev) => ({ ...prev, [seg.index]: data.suggestion }));
    } finally {
      setPolishingIndex(null);
    }
  }

  /** Accept the AI suggestion — copy it into draftText and clear the suggestion. */
  function acceptPolish(index: number, suggestion: string) {
    setDraftText((prev) => ({ ...prev, [index]: suggestion }));
    setPolishSuggestion((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
  }

  /** Reject the AI suggestion — discard it without touching the draft. */
  function rejectPolish(index: number) {
    setPolishSuggestion((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
  }

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

  /**
   * Whether we render the two-column side-by-side layout.
   * True whenever the job has an input file on disk (even before the script exists),
   * so the user can watch the recording at every stage.
   */
  const hasSideBySide = Boolean(job.input_file);

  /**
   * The segment editor panel — shown in both layouts when a script exists.
   * Segments are always listed (for click-to-seek + highlighting); audio
   * players appear per-segment only once audio has been generated.
   */
  function SegmentPanel() {
    if (!job?.script_path) return null;

    return (
      <div className="rounded-lg border border-border bg-muted/50 p-4">
        <p className="text-sm font-medium">Script segments</p>

        {loadingSegments && (
          <p className="mt-2 text-xs text-muted-foreground">Loading segments…</p>
        )}

        {!loadingSegments && (!segments || segments.length === 0) && (
          <p className="mt-2 text-xs text-muted-foreground">
            No segments found in script.
          </p>
        )}

        {segments && segments.length > 0 && (
          <div className="mt-3 space-y-2">
            {segments.map((seg) => {
              const displayText = draftText[seg.index] ?? seg.text;
              const hasDraft =
                draftText[seg.index] !== undefined &&
                draftText[seg.index] !== seg.text;
              const audioSrc = `${seg.audioUrl}${audioKey[seg.index] ? `?t=${audioKey[seg.index]}` : ''}`;
              const isActive = activeSegmentIndex === seg.index;

              return (
                <div
                  key={`${seg.index}-${seg.start}-${seg.end}`}
                  ref={(el) => {
                    if (el) segmentRefs.current.set(seg.index, el);
                    else segmentRefs.current.delete(seg.index);
                  }}
                  className={cn(
                    'rounded border bg-background/80 p-2 space-y-1.5 transition-colors',
                    isActive
                      ? 'border-primary/60 bg-primary/5'
                      : 'border-border/60'
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    {/* Clicking the timestamp seeks the video to this segment's start. */}
                    <button
                      type="button"
                      className="whitespace-nowrap text-xs font-medium text-muted-foreground hover:text-primary transition-colors cursor-pointer"
                      onClick={() => seekToSegment(seg.start)}
                      title="Seek video to this segment"
                    >
                      {seg.start.toFixed(1)}s – {seg.end.toFixed(1)}s ▶
                    </button>
                    <div className="flex flex-wrap gap-1">
                      {hasDraft && (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={savingIndex === seg.index}
                          onClick={() =>
                            handleSaveSegment(seg.index, draftText[seg.index] ?? seg.text)
                          }
                        >
                          {savingIndex === seg.index ? 'Saving…' : 'Save'}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={polishingIndex === seg.index}
                        onClick={() => handlePolish(seg)}
                      >
                        {polishingIndex === seg.index ? 'Polishing…' : 'Polish with AI'}
                      </Button>
                      {job?.audio_path && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={regeneratingIndex === seg.index}
                          onClick={() => handleRegenerateSegment(seg.index)}
                        >
                          {regeneratingIndex === seg.index ? '…' : 'Regenerate audio'}
                        </Button>
                      )}
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

                  {/* Time budget indicator.
                      Uses actual TTS audio duration when loaded; falls back to word-count
                      estimate (~150 wpm) when no audio exists yet. */}
                  {(() => {
                    const actual = audioDuration[seg.index];
                    const spoken = actual ?? estimateSpeechSeconds(displayText);
                    const available = seg.end - seg.start;
                    const ratio = spoken / available;
                    const colorClass =
                      ratio > 1.2
                        ? 'text-red-500'
                        : ratio > 1.0
                        ? 'text-amber-500'
                        : 'text-green-600';
                    const label = actual ? `${spoken.toFixed(2)}s` : `~${spoken.toFixed(2)}s (est.)`;
                    return (
                      <p className={cn('text-xs', colorClass)}>
                        {label} spoken / {available.toFixed(1)}s available
                      </p>
                    );
                  })()}

                  {/* Before/after diff — shown after "Polish with AI" returns a suggestion. */}
                  {polishSuggestion[seg.index] && (
                    <div className="rounded border border-border/60 bg-muted/30 p-2 space-y-2">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <p className="mb-1 text-xs font-medium text-muted-foreground">Original</p>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            {draftText[seg.index] ?? seg.text}
                          </p>
                        </div>
                        <div>
                          <p className="mb-1 text-xs font-medium text-primary">Suggested</p>
                          <p className="text-xs leading-relaxed">
                            {polishSuggestion[seg.index]}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => acceptPolish(seg.index, polishSuggestion[seg.index])}
                        >
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => rejectPolish(seg.index)}
                        >
                          Reject
                        </Button>
                      </div>
                    </div>
                  )}

                  {job?.audio_path && (
                    <audio
                      key={audioSrc}
                      controls
                      src={audioSrc}
                      className="h-7 w-full max-w-md"
                      onLoadedMetadata={(e) => {
                        const dur = (e.currentTarget as HTMLAudioElement).duration;
                        if (Number.isFinite(dur)) {
                          setAudioDuration((prev) => ({ ...prev, [seg.index]: dur }));
                        }
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Generate audio CTA — shown below segments when no audio exists yet */}
        {!job?.audio_path && (
          <Button
            onClick={handleGenerateAudio}
            disabled={generatingAudio || job?.status === 'synthesizing'}
            className="mt-4"
          >
            {generatingAudio || job?.status === 'synthesizing'
              ? 'Generating…'
              : 'Generate audio'}
          </Button>
        )}
      </div>
    );
  }

  /** All non-segment status sections (process, approve, render, final video). */
  function StatusSections() {
    return (
      <>
        {(job?.status === 'pending' || job?.status === 'failed') && (
          <div className="rounded-lg border border-border bg-muted/50 p-4">
            <p className="text-sm text-muted-foreground">
              {job.status === 'failed'
                ? 'Processing failed. Fix any issues and retry.'
                : 'Upload the video to the /input folder, then run Process to generate the script.'}
            </p>
            <Button onClick={handleProcess} disabled={processing} className="mt-4">
              {processing ? 'Processing…' : job.status === 'failed' ? 'Retry' : 'Process'}
            </Button>
          </div>
        )}

        {job?.status === 'review' && (
          <div className="rounded-lg border border-border bg-muted/50 p-4">
            <p className="text-sm">
              Script ready — review the segments below, then approve to proceed.
            </p>
            <Button onClick={handleApprove} disabled={approving} className="mt-4">
              {approving ? 'Approving…' : 'Approve Script'}
            </Button>
          </div>
        )}

        {SegmentPanel()}

        {(job?.status === 'done' || (job?.status === 'failed' && !!job?.audio_path)) && (
          <div className="rounded-lg border border-border bg-muted/50 p-4">
            <p className="text-sm font-medium">Final video</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Audio is ready. Stitch the avatar intro/outro with the screen recording into a final MP4.
            </p>
            <Button onClick={handleRenderVideo} disabled={rendering} className="mt-4">
              {rendering ? 'Rendering…' : '🎬 Render Final Video'}
            </Button>
          </div>
        )}

        {job?.status === 'rendering' && (
          <div className="rounded-lg border border-border bg-muted/50 p-4">
            <p className="text-sm font-medium">Rendering video…</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Stitching the avatar intro/outro with your screen recording. This may take a moment.
            </p>
          </div>
        )}

        {job?.status === 'rendered' && job.final_video_path && (
          <div className="rounded-lg border border-border bg-muted/50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Final video</p>
              <Button variant="outline" size="sm" onClick={handleRenderVideo} disabled={rendering}>
                {rendering ? 'Rendering…' : 'Re-render'}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">Your video is ready to watch or download.</p>
            <video
              controls
              className="w-full rounded border border-border bg-black"
              src={`/api/output/${job.final_video_path}`}
            />
            <a href={`/api/output/${job.final_video_path}`} download className="inline-flex">
              <Button variant="outline">Download MP4</Button>
            </a>
          </div>
        )}
      </>
    );
  }

  /** Shared job header: title, badge, input file label + delete button. */
  function JobHeader() {
    return (
      <>
        <Link href="/" className="text-sm text-primary hover:underline">
          ← Back to dashboard
        </Link>
        <h1 className="mt-4 text-2xl font-semibold">{job?.title ?? job?.input_file ?? job?.id}</h1>
        <Badge variant={statusBadgeVariant(job!.status)} className="mt-2">
          {job?.status}
        </Badge>
        {job?.input_file && (
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
      </>
    );
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * Two-column side-by-side layout
   * Left  — sticky video player sourced from /api/input/[job.input_file]
   * Right — scrollable panel with all status sections and segment editor
   * ───────────────────────────────────────────────────────────────────────── */
  if (hasSideBySide) {
    return (
      <main className="flex h-screen flex-col bg-background">
        {/* Fixed-height header strip */}
        <header className="shrink-0 border-b px-6 py-4">
          {JobHeader()}
        </header>

        {/* Two-column content area fills remaining vertical space */}
        <div className="flex flex-1 overflow-hidden">
          {/* LEFT: input video player — stays in place while segments scroll */}
          <div className="flex w-1/2 flex-col gap-3 border-r p-6 overflow-hidden">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Original recording
            </p>
            <video
              ref={videoRef}
              src={`/api/input/${encodeURIComponent(job.input_file!)}`}
              controls
              className="w-full rounded-lg border border-border bg-black"
              onTimeUpdate={handleTimeUpdate}
            />
          </div>

          {/* RIGHT: scrollable status + segment editor */}
          <div className="flex w-1/2 flex-col gap-4 overflow-y-auto p-6">
            {StatusSections()}
          </div>
        </div>
      </main>
    );
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * Single-column fallback (no input_file on the job)
   * ───────────────────────────────────────────────────────────────────────── */
  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto max-w-2xl">
        {JobHeader()}
        <div className="mt-6 flex flex-col gap-6">
          {StatusSections()}
        </div>
      </div>
    </main>
  );
}
