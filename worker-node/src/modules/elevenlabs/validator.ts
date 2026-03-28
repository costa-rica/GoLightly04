import { ValidationResult } from "../../types";
import logger from "../logger";
import { ElevenLabsApiClient } from "./service";

const MIN_SPEED = 0.7;
const MAX_SPEED = 1.2;

export function validateSpeed(speed: number): ValidationResult {
  if (speed < MIN_SPEED || speed > MAX_SPEED) {
    const error = `Speed must be between ${MIN_SPEED} and ${MAX_SPEED}. Provided: ${speed}`;
    logger.error(error);
    return { valid: false, error };
  }

  logger.info(`Speed validated successfully: ${speed}`);
  return { valid: true };
}

export async function validateVoiceId(
  voiceId: string,
  elevenLabsService: ElevenLabsApiClient,
): Promise<ValidationResult> {
  try {
    const voiceData = await elevenLabsService.validateVoice(voiceId);
    return {
      valid: true,
      voiceName: voiceData.name,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return {
      valid: false,
      error: errorMessage,
    };
  }
}
