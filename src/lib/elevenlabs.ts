/**
 * ElevenLabs text-to-speech: convert script text to audio using a configured voice.
 */

const ELEVENLABS_BASE = 'https://api.elevenlabs.io/v1';

function getConfig(): { apiKey: string; voiceId: string } {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  if (!apiKey) {
    throw new Error('ELEVENLABS_API_KEY is not set in .env.local');
  }
  if (!voiceId) {
    throw new Error('ELEVENLABS_VOICE_ID is not set in .env.local');
  }
  return { apiKey, voiceId };
}

/**
 * Convert text to speech using the configured voice (e.g. BakeSuite).
 * Returns the raw audio bytes (MP3).
 */
export async function textToSpeech(text: string): Promise<Buffer> {
  const { apiKey, voiceId } = getConfig();
  const url = `${ELEVENLABS_BASE}/text-to-speech/${voiceId}?output_format=mp3_44100_128`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
    },
    body: JSON.stringify({
      text: text.trim(),
      model_id: 'eleven_multilingual_v2',
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ElevenLabs TTS failed (${res.status}): ${err}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
