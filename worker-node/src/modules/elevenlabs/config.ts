export const DEFAULT_VOICE_ID = "nPczCjzI2devNBz1zQrb";
export const DEFAULT_SPEED = 0.85;

export interface ElevenLabsRuntimeConfig {
  apiKey: string;
  outputDirectory: string;
  csvDirectory?: string;
  defaultVoiceId: string;
  defaultSpeed: number;
}

export function getElevenLabsRuntimeConfig(): ElevenLabsRuntimeConfig {
  const apiKey = process.env.API_KEY_ELEVEN_LABS;
  if (!apiKey) {
    throw new Error("API_KEY_ELEVEN_LABS environment variable is not set");
  }

  const outputDirectory = process.env.PATH_SAVED_ELEVENLABS_AUDIO_MP3_OUTPUT;
  if (!outputDirectory) {
    throw new Error(
      "PATH_SAVED_ELEVENLABS_AUDIO_MP3_OUTPUT environment variable is not set",
    );
  }

  return {
    apiKey,
    outputDirectory,
    csvDirectory: process.env.PATH_USER_ELEVENLABS_CSV_FILES,
    defaultVoiceId:
      process.env.DEFAULT_ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID,
    defaultSpeed: parseFloat(
      process.env.DEFAULT_ELEVENLABS_SPEED || `${DEFAULT_SPEED}`,
    ),
  };
}
