# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun dev          # Start dev server at http://localhost:3000
bun build        # Production build
bun start        # Run production server
bun lint         # ESLint
```

FFmpeg and ffprobe must be installed (`brew install ffmpeg`).

Required `.env.local`:
```
GEMINI_API_KEY=
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=
```

## Architecture

This is a Next.js App Router application that converts silent screen recordings into narrated videos. The pipeline is:

1. **Ingest** — Drop `.mov`/`.mp4` files in `/input`, then hit `/api/scan` to create `Job` records in SQLite (`db/videogen.db`)
2. **Transcribe** — `/api/process` uploads the video to Gemini Files API (`gemini-2.5-flash`) and gets back a timestamped JSON script; result saved as `/output/[jobId]/[name]_script.md`
3. **Review** — User edits segments inline in the UI; `PATCH /api/jobs/[id]/script/segment` updates the markdown file in place
4. **Synthesize** — `/api/jobs/[id]/audio` calls ElevenLabs TTS per segment, writing individual MP3s named `[start]-[end].mp3`
5. **Render** — `/api/render` runs FFmpeg to stitch the screen recording + avatar overlay + audio into `final.mp4`

### State

- **SQLite** tracks job metadata and status; `src/lib/db/schema.ts` defines the single `jobs` table
- **Filesystem** holds the actual content — scripts, audio, final video — under `/output/[jobId]/`
- **Rehydration**: if the DB is lost, `rehydrateJobFromDisk()` in `src/lib/files.ts` reconstructs job state by scanning `/output`

### Job status flow

```
pending → transcribing → review → approved → synthesizing → done → rendering → rendered
                                                                              ↓ failure
                                                                           failed
```

### Key modules

| File | Purpose |
|------|---------|
| `src/lib/gemini.ts` | Gemini upload + polling + JSON parsing. Edit `TRANSCRIPT_PROMPT` here to tune narration style |
| `src/lib/elevenlabs.ts` | Single `textToSpeech()` call; returns raw MP3 Buffer |
| `src/lib/ffmpeg.ts` | `stitchVideo()` does MOV→MP4 conversion, audio strip, avatar PiP overlay, final merge |
| `src/lib/files.ts` | All file I/O; `parseScriptMdToSegments()` parses `## 0.0s – 5.9s` headers into segment objects |
| `src/lib/db/index.ts` | Opens/initializes the SQLite connection |

### API routes (all under `src/app/api/`)

- `POST /api/process` — Gemini transcription
- `POST /api/jobs/[id]/audio` — TTS synthesis; supports `?limit=N&offset=M` for partial re-generation
- `PATCH /api/jobs/[id]/script/segment` — Update one segment text without regenerating audio
- `POST /api/render` — FFmpeg final stitch
- `GET /api/output/[[...path]]` — Serves files from `/output` (path traversal protected)
- `POST /api/upload` — Accepts multipart video upload, saves to `/input`

### Avatar assets

Avatar intro/outro clips should be placed in `/assets/`. `splitAvatar()` in `ffmpeg.ts` splits a single clip into first-10s intro and last-10s outro for the PiP overlay.
