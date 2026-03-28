import {
  ElevenLabsBatchProcessOptions,
  ElevenLabsBatchResult,
  ElevenLabsGeneratedFile,
  ElevenLabsGeneratedFileResult,
  ElevenLabsRequest,
} from "../../types";
import logger from "../logger";
import { getElevenLabsRuntimeConfig } from "./config";
import { saveAudioFile } from "./fileSaver";
import { ElevenLabsApiClient, ElevenLabsService } from "./service";
import { validateSpeed, validateVoiceId } from "./validator";

function normalizeBatchRequest(
  request: ElevenLabsRequest,
  defaultVoiceId: string,
  defaultSpeed: number,
): ElevenLabsRequest {
  return {
    ...request,
    voiceId: request.voiceId || defaultVoiceId,
    speed:
      Number.isFinite(request.speed) ? request.speed : defaultSpeed,
  };
}

async function processRequest(
  request: ElevenLabsRequest,
  outputDirectory: string,
  service: ElevenLabsApiClient,
): Promise<ElevenLabsGeneratedFileResult> {
  const speedValidation = validateSpeed(request.speed);
  if (!speedValidation.valid) {
    return {
      id: request.id,
      success: false,
      error: speedValidation.error || "Invalid speed",
    };
  }

  const voiceValidation = await validateVoiceId(request.voiceId, service);
  if (!voiceValidation.valid || !voiceValidation.voiceName) {
    return {
      id: request.id,
      success: false,
      error: voiceValidation.error || "Invalid voice_id",
    };
  }

  try {
    const audioBuffer = await service.textToSpeech(
      request.text,
      request.voiceId,
      request.speed,
    );

    const savedAudio = await saveAudioFile(
      audioBuffer,
      voiceValidation.voiceName,
      request.text,
      outputDirectory,
    );

    const generatedFile: ElevenLabsGeneratedFile = {
      id: request.id,
      text: request.text,
      voiceId: request.voiceId,
      voiceName: voiceValidation.voiceName,
      speed: request.speed,
      ...savedAudio,
    };

    return {
      id: request.id,
      success: true,
      generatedFile,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error(`Error processing ElevenLabs request ${request.id}: ${errorMessage}`);
    return {
      id: request.id,
      success: false,
      error: errorMessage,
    };
  }
}

export async function processElevenLabsBatch(
  options: ElevenLabsBatchProcessOptions,
  dependencies?: {
    service?: ElevenLabsApiClient;
  },
): Promise<ElevenLabsBatchResult> {
  const runtimeConfig = getElevenLabsRuntimeConfig();
  const service =
    dependencies?.service || new ElevenLabsService(runtimeConfig.apiKey);
  const outputDirectory =
    options.outputDirectory || runtimeConfig.outputDirectory;
  const defaultVoiceId =
    options.defaultVoiceId || runtimeConfig.defaultVoiceId;
  const defaultSpeed =
    options.defaultSpeed ?? runtimeConfig.defaultSpeed;

  logger.info(
    `Processing ${options.requests.length} ElevenLabs request(s) with internal module`,
  );

  const results: ElevenLabsGeneratedFileResult[] = [];

  for (const request of options.requests) {
    const normalizedRequest = normalizeBatchRequest(
      request,
      defaultVoiceId,
      defaultSpeed,
    );
    const result = await processRequest(
      normalizedRequest,
      outputDirectory,
      service,
    );
    results.push(result);
  }

  const successful = results.filter((result) => result.success);
  const failed = results.filter((result) => !result.success);

  return {
    success: failed.length === 0,
    successCount: successful.length,
    failureCount: failed.length,
    results,
  };
}
