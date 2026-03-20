# Auto Instruction Gen

Turn a **silent screen recording** into a **fully narrated video** — automatically.

This tool watches you record your screen, writes a timestamped narration script using AI, lets you edit it, generates voiceover audio, and stitches everything into a final MP4 with an optional picture-in-picture avatar overlay.

**No coding required to use it** — just install, add your API keys, and run.

---

## What it does

1. You drop in a screen recording (`.mov` or `.mp4`)
2. Google Gemini watches the video and writes a timed narration script
3. You review and edit the script in the browser
4. ElevenLabs generates voiceover audio for each segment
5. FFmpeg stitches the screen recording + audio + optional avatar overlay into a final MP4

---

## Requirements

Before you start, you'll need:

- **Node.js** (v18 or later) — [download here](https://nodejs.org)
- **Bun** (package manager) — install by running:
  ```bash
  curl -fsSL https://bun.sh/install | bash
  ```
- **FFmpeg** (only needed for the final render step)
  - macOS: `brew install ffmpeg`
  - Windows: `winget install ffmpeg`
  - Linux: `sudo apt install ffmpeg`
- **A Google Gemini API key** — [get one free at Google AI Studio](https://aistudio.google.com/apikey)
- **An ElevenLabs API key + Voice ID** — [sign up at ElevenLabs](https://elevenlabs.io)

---

## Setup (step by step)

### 1. Get your API keys

**Gemini (Google AI)**
1. Go to [https://aistudio.google.com/apikey](https://aistudio.google.com/apikey)
2. Click **Create API key**
3. Copy the key — you'll need it in a moment

**ElevenLabs**
1. Go to [https://elevenlabs.io](https://elevenlabs.io) and create a free account
2. Go to your **Profile** → **API Keys** and copy your API key
3. Go to **Voices**, pick a voice you like, and copy its **Voice ID** (shown under the voice name)

---

### 2. Install the project

Open a terminal and run:

```bash
git clone https://github.com/xMmAI/video-script-generation.git
cd video-script-generation
bun install
```

---

### 3. Add your API keys

In the project folder, create a file called `.env.local` and paste in your keys:

```
GEMINI_API_KEY=your_gemini_key_here
ELEVENLABS_API_KEY=your_elevenlabs_key_here
ELEVENLABS_VOICE_ID=your_voice_id_here
```

> This file is never committed to git — your keys stay private.

---

### 4. Start the app

```bash
bun dev
```

Then open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Using the app

### Upload a recording

Either:
- Click **Upload** in the UI and select your `.mov` or `.mp4` file, or
- Copy the file into the `/input` folder and click **Scan for new videos**

### Process the video

Click **Process** on the job. Gemini will watch your video and generate a timestamped narration script. This usually takes 30–90 seconds depending on video length.

### Review and edit

Open the job to see the script broken into segments like:

```
## 0.0s – 3.7s
Here you can see the dashboard overview...
```

Click any segment to edit the narration text. Changes save automatically.

### Generate audio

Click **Generate audio**. ElevenLabs will create an MP3 for each segment. This takes a few seconds per segment.

### Render the final video (optional)

If you want a finished MP4 with the audio baked in (and optionally a picture-in-picture avatar overlay), click **Render Final Video**.

> FFmpeg must be installed for this step. The output file will be at `output/<jobId>/final.mp4`.

---

## Avatar overlay (optional)

If you want a picture-in-picture "talking head" overlay on the final video:

1. Record a clip of yourself talking (or use any video)
2. Place it in the `/assets/` folder as `avatar.mp4`
3. The renderer will automatically use the first 10 seconds as an intro and the last 10 seconds as an outro

If no avatar file is found, the render step will produce a clean screen recording + audio without the overlay.

---

## Customizing the narration style

The AI prompt that tells Gemini how to write the narration script is in `src/lib/gemini.ts`. Open that file and look for the constant `TRANSCRIPT_PROMPT` near the top — it's a multi-line string that starts with:

```
You are analyzing a silent screen recording...
```

Edit the text inside that constant to change how Gemini writes the narration. Some ideas:

- **Change the tone** — add something like *"Write in a friendly, enthusiastic tone"* or *"Use a formal, professional style"*
- **Add context about your product** — e.g. *"This is a tutorial for [Your App Name], a project management tool for small teams"*
- **Control segment length** — e.g. *"Keep each segment to 1–2 sentences"* or *"Allow up to 3 sentences per segment for complex steps"*
- **Avoid certain phrases** — e.g. *"Never start a sentence with 'Simply' or 'Just'"*
- **Change the intro style** — the prompt currently asks for a greeting and introduction; you can remove this or change the format

After saving your edit, the new prompt takes effect the next time you click **Process** on a job — no restart needed.

---

## Folder structure

```
input/       — drop your screen recordings here
output/      — generated scripts, audio, and final videos land here
assets/      — optional avatar video goes here
db/          — local database (auto-created, don't edit)
src/         — app source code
```

The `input/`, `output/`, and `db/` folders are local-only and never committed to git.

---

## Privacy & costs

- Your video is **uploaded to Google Gemini** for transcription. Review [Google's data usage policy](https://ai.google.dev/gemini-api/terms) if this matters to you.
- Narration text is sent to **ElevenLabs** for audio generation.
- Both services have free tiers, but long or frequent use may incur costs. Start with short clips while testing.

---

## Troubleshooting

**"FFmpeg not found"**
Install FFmpeg using the instructions in the Requirements section above. After installing, restart your terminal.

**Gemini times out on long videos**
Try trimming your recording to under 10 minutes. Very long videos can hit API timeouts.

**ElevenLabs audio sounds wrong**
Go to [elevenlabs.io](https://elevenlabs.io), pick a different voice, and update `ELEVENLABS_VOICE_ID` in `.env.local`.

**The app won't start**
Make sure you ran `bun install` and that your `.env.local` file exists with all three keys filled in.

**Jobs are missing after a restart**
The local database lives in `db/`. If it gets deleted, the app will automatically rebuild job state from files in `output/` on next load.

---

## License

Apache 2.0 — see [LICENSE](./LICENSE) for details.
