# Changelog

All notable changes to Narri are documented here.

---

## [Unreleased] — feature/v2

### Added
- **Segment-aware rendering** — `stitchVideo()` now accepts `segments` + `jobOutputDir`; builds per-segment video clips and audio files, then concats them into `combined_video.mp4` / `combined_audio.mp3` before the final merge
- `getAudioDuration()` — shared helper (wraps `getMediaDuration`) for measuring MP3 durations
- `extractClip()` — extracts a precise slice of a silent video (start + duration, frame-accurate output seek)
- `freezeExtend()` — extends a video clip by freeze-clamping the last frame via `tpad=stop_mode=clone`
- `padAudioWithSilence()` — pads an MP3 to an exact target duration using `apad + atrim`
- `createSilence()` — generates silent MP3 of given duration via `lavfi anullsrc`
- **Avatar overlay improvements** — white background (8 px pad), subtle gray outline (2 px), rounded corners via `geq` alpha mask; overlay duration driven by actual asset file duration (not hardcoded 10 s)
- **Re-render button** on job detail page for `rendered` status jobs
- **Retry routes to correct endpoint** — home page `handleProcess` now inspects `script_path` + `audio_path`; routes `failed` jobs with both assets to `/api/render` instead of `/api/process` (prevents accidentally re-running transcription on approved jobs)
- **Render accepts `failed` status** — `/api/render` now allows retrying jobs in `done`, `rendered`, or `failed` state
- **Gemini JSON retry** — `/api/process` retries Gemini transcription up to 3× with exponential back-off when it returns malformed JSON
- **Gemini structured output** — `responseMimeType: 'application/json'` added to the Gemini call to force valid JSON responses
- **Product-aware narration** — `PRODUCT_NAME`, `PRODUCT_DESCRIPTION`, `PRODUCT_AUDIENCE` env vars injected into the Gemini prompt; README updated with examples
- **Video upload drop zone** — drag-and-drop `.mov`/`.mp4` to `/api/upload`; saves directly to `/input`
- **Input file streaming fix** — `ReadableStream` wrappers in `/api/input/[...filename]` now guard `desiredSize !== null` and call `stream.destroy()` on `cancel()` to avoid write-after-close errors
- App renamed to **Narri** throughout UI + README

### Fixed
- Retry button on home page was re-running Gemini transcription for jobs that already had approved scripts and audio — now routes to `/api/render`
- Empty clip crash (`Duration: N/A`, exit 234) when a segment's start timestamp exceeded the actual video duration — now detected via measured clip duration (< 0.05 s = past end) and handled with freeze-from-last-frame
- Avatar overlay duration was hardcoded to 10 s; now reads the actual asset file duration

---

## 🔬 Open Investigation — Audio/Video Sync (to continue)

**Status:** Actively broken. Multiple approaches tried, none fully correct yet.

### The problem
Segments have a `start`/`end` in the original video (e.g. `## 44.5s – 89.0s`) and a matching MP3 file. The user expects: **audio for segment X should play at approximately `seg.start` seconds in the rendered output** — matching when that video footage appears.

### What was tried

| Attempt | Approach | Result |
|---------|----------|--------|
| v1 | Pad audio with silence to fill full `seg.end - seg.start` | Audio plays at correct video position but dead-time segments (e.g. 44.5 s scene, 11 s audio) add 33 s of silence — cumulative drift pushes all subsequent audio 32 s late |
| v2 | Extract only `min(audioDuration, segDuration)` of video; freeze-extend if needed | Eliminates silence padding but skips video footage in dead-time segments — video jumps forward, most segments freeze |

### Root cause
The two constraints are in tension:
1. **Audio must play at `seg.start` seconds** (user expectation)
2. **Video must not skip footage** (continuous playback)

Satisfying (1) without (2) → v1 drift. Satisfying (2) without (1) → v2 jumps.

### Correct approach (not yet implemented)
Build a **timeline-based render** that tracks `renderTime` (rendered output position) vs `videoTime` (original video position):

- For each segment, extract video from `videoTime` to `seg.end` (continuous, no skipping)
- If audio duration > scene duration → freeze-extend the clip; increment a `cumulativeFreeze` offset
- Audio is placed at `seg.start + cumulativeFreeze` in the rendered output (not at cumulative sum of previous segment durations)
- Build one mixed audio track: silence-padded gaps between audio segments at their correct rendered timestamps (using `adelay` filter or concat with calculated silence durations)
- This keeps video continuous AND aligns audio to the footage it narrates

**Key files to change:** `src/lib/ffmpeg.ts` — `stitchVideo()` segment loop (lines ~307–400)