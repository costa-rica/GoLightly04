import logger from "../logger";
import { ElevenLabsVoice, TTSRequest } from "../../types";

const ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1";

export interface ElevenLabsApiClient {
  validateVoice(voiceId: string): Promise<ElevenLabsVoice>;
  textToSpeech(text: string, voiceId: string, speed: number): Promise<Buffer>;
}

export class ElevenLabsService implements ElevenLabsApiClient {
  constructor(private readonly apiKey: string) {}

  async validateVoice(voiceId: string): Promise<ElevenLabsVoice> {
    logger.info(`Validating ElevenLabs voice_id: ${voiceId}`);

    const response = await fetch(`${ELEVENLABS_API_BASE}/voices/${voiceId}`, {
      headers: {
        "xi-api-key": this.apiKey,
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Invalid voice_id: ${voiceId} - Voice not found`);
      }

      if (response.status === 401) {
        throw new Error("Invalid API key for ElevenLabs");
      }

      throw new Error(`Error validating voice: HTTP ${response.status}`);
    }

    const voice = (await response.json()) as ElevenLabsVoice;
    logger.info(`Voice validated successfully: ${voice.name} (${voiceId})`);
    return voice;
  }

  async textToSpeech(
    text: string,
    voiceId: string,
    speed: number,
  ): Promise<Buffer> {
    logger.info(
      `Converting text to speech with voice_id: ${voiceId}, speed: ${speed}`,
    );

    const requestData: TTSRequest = {
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: {
        speed,
      },
    };

    const response = await fetch(
      `${ELEVENLABS_API_BASE}/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": this.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestData),
      },
    );

    if (!response.ok) {
      throw new Error(`Error in text-to-speech conversion: HTTP ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    logger.info("Text-to-speech conversion successful");
    return Buffer.from(arrayBuffer);
  }
}
