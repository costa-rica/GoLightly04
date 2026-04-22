import fs from "node:fs/promises";
import path from "node:path";

import axios from "axios";

import { loadEnv } from "../config/env";
import { getElevenLabsAudioRoot } from "../lib/projectPaths";

interface GenerateSpeechParams {
  text: string;
  meditationId: number;
  jobId: number;
  sequence: number;
  voiceId?: string | null;
  speed?: number | null;
}

function getTodayFolder(now = new Date()) {
  return now.toISOString().slice(0, 10).replaceAll("-", "");
}

export async function generateSpeech({
  text,
  meditationId,
  jobId,
  sequence,
  voiceId,
  speed,
}: GenerateSpeechParams): Promise<string> {
  const env = loadEnv();
  const resolvedVoiceId = voiceId ?? env.DEFAULT_ELEVENLABS_VOICE_ID;
  const resolvedSpeed = speed ?? env.DEFAULT_ELEVENLABS_SPEED;

  const response = await axios.post(
    `https://api.elevenlabs.io/v1/text-to-speech/${resolvedVoiceId}`,
    {
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: {
        speed: resolvedSpeed,
      },
    },
    {
      headers: {
        "xi-api-key": env.API_KEY_ELEVEN_LABS,
        Accept: "audio/mpeg",
        "Content-Type": "application/json",
      },
      responseType: "arraybuffer",
    },
  );

  const folder = path.join(getElevenLabsAudioRoot(), getTodayFolder());
  await fs.mkdir(folder, { recursive: true });
  const filename = `el_${meditationId}_${jobId}_${sequence}.mp3`;
  const destination = path.join(folder, filename);
  await fs.writeFile(destination, Buffer.from(response.data));
  return destination;
}
