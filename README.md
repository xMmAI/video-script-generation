# Auto Instruction Generator (Script & Audio Generator)

Turn a **silent screen recording** into a **timestamped narration script**, generate **per-segment voiceover audio**, and (optionally) **render a final MP4** with a picture-in-picture “avatar” overlay.

Built with **Next.js (App Router)** + local-first storage (SQLite) +:
- **Gemini**: video → timestamped script
- **ElevenLabs**: script segments → MP3
- **FFmpeg**: stitch overlay + audio into a final MP4

## What it does

- **Upload or scan**: drop a `.mov` / `.mp4` into `/input` (or upload via the UI)
- **Process**: sends the video to Gemini and generates a markdown script like:
  - `## 0.0s – 3.7s` + narration text
- **Review & edit**: adjust narration per segment in the job page
- **Generate audio**: creates one MP3 per segment in `/output/<jobId>/`
- **Render (optional)**: stitches your screen recording + avatar overlay + audio into `final.mp4`

## Requirements

- **Node.js**: recent LTS recommended
- **Gemini API key**: `GEMINI_API_KEY`
- **ElevenLabs API key**: `ELEVENLABS_API_KEY`
  - Voice ID: `ELEVENLABS_VOICE_ID` (required; see your ElevenLabs dashboard)
- **FFmpeg + ffprobe** (only required for “Render Final Video”)
  - macOS: `brew install ffmpeg`
  - Windows: `winget install ffmpeg`

## Quickstart (local)

1. Install dependencies:

```bash
npm install
```

2. Create `.env.local` in the project root:

```bash
GEMINI_API_KEY="..."
ELEVENLABS_API_KEY="..."
ELEVENLABS_VOICE_ID="your_elevenlabs_voice_id"
```

3. Start the dev server:

```bash
npm run dev
```

4. Open `http://localhost:3000` and run a job:

- Upload a `.mov` / `.mp4` in the UI **or** copy a file into `/input`
- Click **Scan for new videos**
- Click **Process** on the job (Gemini generates the timestamped script)
- Open the job and **edit narration per segment**
- Click **Generate audio** (ElevenLabs creates per-segment MP3s)
- (Optional) Click **Render Final Video** (FFmpeg generates `/output/<jobId>/final.mp4`)

## Files & folders

- `input/`: your raw screen recordings (not committed)
- `output/`: generated scripts/audio/videos (not committed)
  - `output/<jobId>/<basename>_script.md`
  - `output/<jobId>/<start>-<end>.mp3` (per-segment)
  - `output/<jobId>/audio.mp3` (created during render if missing)
  - `output/<jobId>/final.mp4` (render output)
- `db/`: local SQLite database (`db/videogen.db`) (not committed)
- `assets/`: avatar overlay media
  - The renderer looks for `assets/talking_whisk.mp4`, `assets/talking_whisk.mov`, or `assets/avatar.mp4`
  - For open-source distribution, you’ll typically provide your own `assets/avatar.mp4` locally (don’t commit proprietary media)

## API overview

These are the main endpoints used by the UI:

- `POST /api/upload`: upload a `.mov`/`.mp4` into `/input`
- `GET /api/scan`: scan `/input` and create new “jobs” for new files
- `GET /api/jobs`: list jobs
- `GET /api/jobs/:id`: job detail
- `POST /api/process`: Gemini video → timestamped script (writes to `/output/<jobId>/..._script.md`)
- `PATCH /api/jobs/:id/script/segment`: update the narrative text of one segment
- `POST /api/jobs/:id/audio`: generate per-segment MP3s via ElevenLabs
- `POST /api/render`: FFmpeg stitch → `/output/<jobId>/final.mp4`
- `GET /api/output/...`: serve files out of `/output` to the browser

## Editing Gemini prompts

Script generation (video → timestamped narration) is driven by a single system prompt. To change tone, style, or instructions:

1. **File**: `src/lib/gemini.ts`
2. **Prompt constant**: `TRANSCRIPT_PROMPT` (near the top of the file). Edit the multi-line template string to adjust:
   - Narrator style (e.g. warm, formal, concise)
   - Wording rules (e.g. “don’t start every segment with ‘You can…’”)
   - Output format reminder (the prompt tells the model to return a JSON array of `{ start, end, text }` segments)
3. **Model**: `GEMINI_TRANSCRIPTION_MODEL` is set to `gemini-2.5-flash`. Change this constant if you want to use another Gemini model.

The code expects the model to return **only** a JSON array of objects with `start` (seconds), `end` (seconds), and `text` (string). If you change the requested format in the prompt, you must update the parsing in `generateTimestampedScript` (and any use of `ScriptSegment`) in the same file.

## Notes (privacy + cost)

- This project is **local-first** for files and DB, but it **uploads video to Gemini** and sends narration text to **ElevenLabs**.
- Both services may have **usage costs**; avoid huge/long videos until you’re happy with prompts and flow.

## License

Add a `LICENSE` file before open-sourcing (MIT/Apache-2.0 are common choices).
