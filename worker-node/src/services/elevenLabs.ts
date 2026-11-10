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

/**
 * The request uses responseType "arraybuffer", so on failure axios hands back the JSON error body
 * as raw bytes and its default message is only "Request failed with status code N". Decode the
 * body so the real reason (bad key, quota, unknown voice...) reaches the job's lastError and logs.
 */
export function toElevenLabsError(error: unknown): Error {
  if (!axios.isAxiosError(error) || !error.response) {
    return error instanceof Error ? error : new Error(String(error));
  }

  const { status, data } = error.response;
  let detail = "";
  try {
    const raw =
      data instanceof ArrayBuffer || ArrayBuffer.isView(data)
        ? Buffer.from(data as ArrayBuffer).toString("utf8")
        : typeof data === "string"
          ? data
          : JSON.stringify(data);
    try {
      const parsed = JSON.parse(raw);
      const body = parsed?.detail ?? parsed;
      detail =
        typeof body === "string"
          ? body
          : [body?.status ?? body?.code, body?.message].filter(Boolean).join(": ") || raw;
    } catch {
      detail = raw;
    }
  } catch {
    detail = "";
  }

  const message = `ElevenLabs request failed with status ${status}${detail ? `: ${detail.slice(0, 500)}` : ""}`;
  return new Error(message, { cause: error });
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

  let response;
  try {
    response = await axios.post(
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
  } catch (error) {
    throw toElevenLabsError(error);
  }

  const folder = path.join(getElevenLabsAudioRoot(), getTodayFolder());
  await fs.mkdir(folder, { recursive: true });
  const filename = `el_${meditationId}_${jobId}_${sequence}.mp3`;
  const destination = path.join(folder, filename);
  await fs.writeFile(destination, Buffer.from(response.data));
  return destination;
}
