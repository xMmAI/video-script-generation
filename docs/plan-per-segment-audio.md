# Plan: Per-segment audio with timestamp filenames

## Goal
- Generate **one audio file per script segment** (each `## X.Xs – Y.Ys` block).
- **Output filenames = timestamp** (e.g. `0.0-5.9.mp3`, `5.9-9.3.mp3`) for easy use in video editing.
- **Never send timestamp text to ElevenLabs** — only the narrative text under each header.
- (Later) Recompute segment timestamps from actual TTS duration so script.md stays in sync.

---

## 1. Parse script.md into segments (text only, no timestamp spoken)

**Where:** `src/lib/files.ts` (new function).

- **Input:** Full script markdown (with `## 0.0s – 5.9s` style headers).
- **Output:** Array of `{ start, end, text }[]` where `text` is **only** the narrative (no `## …` line).
- **Logic:** Split on lines that match `## \d+\.\d+s – \d+\.\d+s`, parse start/end from header; everything until the next `##` (trimmed) is `text`. First block may have leading content before the first `##` — drop or treat as preamble; ensure we don’t send the header line itself to TTS.

This guarantees ElevenLabs never receives strings like "0.0s – 5.9s".

---

## 2. Per-segment TTS and timestamp-named files

**Where:** `src/app/api/jobs/[id]/audio/route.ts` (and optionally `src/lib/elevenlabs.ts` if we add a helper).

- Read script via existing `readScriptByPath(script_path)`.
- Parse into segments with the new parser (step 1).
- **Optional for test:** Support a limit (e.g. first N segments or first N seconds). For “first 9 seconds, 2 segments” we use first 2 segments only.
- For each segment:
  - Call `textToSpeech(segment.text)` (text only).
  - Build filename from segment times, e.g. `{start}-{end}.mp3` → `0.0-5.9.mp3`, `5.9-9.3.mp3`. Use a consistent format (e.g. one decimal place) so filenames sort correctly.
  - Write buffer to `output/[jobId]/0.0-5.9.mp3`, `output/[jobId]/5.9-9.3.mp3`, etc.
- **DB/storage:** Either:
  - **A)** Keep `audio_path` as a single “primary” path (e.g. first file or a placeholder), and document that segment files live in `output/[jobId]/*.mp3`, or  
  - **B)** Add a new field (e.g. `audio_segments` JSON array of relative paths) and set `audio_path` to null or to a concatenated/manifest path.  
  For the test, we can keep writing files and optionally set `audio_path` to the first segment or leave as “multiple files in job dir”.

---

## 3. Get duration from each TTS result (for future timestamp rewrite)

- Use an MP3 duration utility (e.g. `mp3-duration` or `music-metadata` on the buffer) to get length in seconds for each segment’s audio.
- Store `durationSeconds` per segment. **Not required for the “first 2 segments” test**, but we’ll need it to recompute timestamps in script.md later (segment N end = segment N start + duration N).

---

## 4. (Later) Rewrite script.md timestamps from actual durations

- After generating all segment audio, recompute:  
  `seg[0].end = seg[0].start + duration[0]`, `seg[1].start = seg[0].end`, `seg[1].end = seg[1].start + duration[1]`, etc.
- Rewrite `script.md` so each header is `## {start}s – {end}s` with new values.  
  Defer this to a follow-up; not in the first test.

---

## 5. Test scope: first 9 seconds, 2 audio files

- **Script:** `output/54e97f2c-f997-4d92-a85d-9a9b5925a55f/order_request_form_script.md`
- **Segments used:** Only the first 2:
  - **Segment 1:** `0.0s – 5.9s` → text: *"Starting from the dashboard, let's navigate to the order requests section by clicking Order Request tab."* → output `0.0-5.9.mp3`
  - **Segment 2:** `5.9s – 9.3s` → text: *"Once the order requests load, you can access the form settings at the top right to customise your customer inquiry form, by clicking on Manage Form Settings."* → output `5.9-9.3.mp3`
- **Validation:**
  - No timestamp text is sent to ElevenLabs (only the two narrative sentences).
  - Two files created: `0.0-5.9.mp3`, `5.9-9.3.mp3` in that job’s output dir.
  - Filenames are timestamp-based and sort correctly for video ven.

---

## File change summary

| File | Change |
|------|--------|
| `src/lib/files.ts` | Add `parseScriptMdToSegments(md: string): ScriptSegment[]` that returns segments with only narrative text (strip `## …` headers from content sent to TTS). |
| `src/app/api/jobs/[id]/audio/route.ts` | Use parser; loop segments (with optional `limit`, e.g. 2 for test); TTS per segment; write `{start}-{end}.mp3`; get duration per buffer (optional for test); update DB as agreed (e.g. first segment path or list). |
| `src/lib/elevenlabs.ts` | No change required; `textToSpeech(text)` already takes plain text. |
| **New dependency** | Add a small lib to get MP3 duration from buffer (e.g. `mp3-duration` or `music-metadata`) for the “recompute timestamps” step; can be added when we implement step 4. |

---

## Naming convention for segment files

- Format: `{start}-{end}.mp3` with one decimal place, e.g. `0.0-5.9.mp3`, `5.9-9.3.mp3`.
- Ensures lexicographic sort matches chronological order.
- Easy for video tooling to map timestamp ranges to files.
