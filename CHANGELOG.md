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
- Audio/video sync: replaced `-f concat -c copy` (concat demuxer) with `filter_complex concat` for audio assembly — demuxer mangles timestamps with mixed-format inputs (ElevenLabs VBR MP3 + generated silence); filter fully decodes all inputs to raw samples before stitching, eliminating drift
- Dead-time silence gaps: Gemini intentionally writes short narrations for long load/navigation windows; previously this padded 40+ seconds of silence into the rendered track. Now uses a 3-second threshold — gaps > 3 s trim video to narration length (dead time is skipped); gaps ≤ 3 s show full scene and pad audio with brief silence
- Missing script segment for job `946274a1` — `## 202.4s – 217.3s` header was absent from script markdown despite `202.4-217.3.mp3` existing; renderer silently dropped both the video and audio for that 14.9 s window

---

## 🔬 Audio/Video Sync — Current State

### Behaviour as of this session

| Case | Behaviour |
|------|-----------|
| `audio > scene` | Freeze-extend video to match audio duration |
| `audio < scene` by ≤ 3 s | Show full scene; pad audio with silence |
| `audio < scene` by > 3 s | Dead time (Gemini-collapsed navigation/loading) — trim video to narration length, skip the gap |
| Past source video end | Freeze last known frame for audio duration |

### Known limitation
Dead-time segments produce a visible jump cut in the rendered video (the source recording jumps forward by the skipped window). This is acceptable for navigation/loading but can feel abrupt if Gemini miscategorises a meaningful action as dead time. The threshold (`MAX_SILENCE_SECONDS = 3.0` in `stitchVideo()`) can be tuned if this becomes a problem.

### Next candidate improvement
If jump cuts from dead-time skips are too jarring, the correct fix is speed-ramping: use FFmpeg `setpts` to play the dead-time footage at 4–8× speed under the narration rather than cutting it entirely. This would require measuring the speed factor per segment and applying a matching `atempo` to the audio.