import fs from "fs";
import path from "path";

import {
  AudioProcessingResult,
  AudioSequenceStep,
  AudioWorkflowInputStep,
  AudioWorkflowResult,
  GeneratedMeditationAudio,
} from "../../types";
import logger from "../logger";
import { getAudioRuntimeConfig } from "./config";
import { combineAudioFiles, ensureFfmpegAvailable } from "./audioProcessor";
import { validateAudioFiles, validateOutputDirectory } from "./fileValidator";

export interface AudioProcessorClient {
  combineAudioFiles(
    steps: AudioSequenceStep[],
    outputPath: string,
    projectResourcesPath: string,
  ): Promise<AudioProcessingResult>;
}

function generateOutputFileName(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  const timestamp = `${year}${month}${day}_${hours}${minutes}${seconds}`;
  return `output_${timestamp}.mp3`;
}

function generateDateFolder(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

export function normalizeAudioWorkflowSteps(
  steps: AudioWorkflowInputStep[],
): AudioSequenceStep[] {
  return steps.map((step) => ({
    id: String(step.id),
    audio_file_name_and_path: step.audioFilePath,
    pause_duration: step.pauseDuration,
  }));
}

export async function processAudioSequence(
  inputSteps: AudioWorkflowInputStep[],
  dependencies?: {
    processor?: AudioProcessorClient;
  },
): Promise<AudioWorkflowResult> {
  try {
    const runtimeConfig = getAudioRuntimeConfig();
    if (!dependencies?.processor) {
      ensureFfmpegAvailable();
    }

    const steps = normalizeAudioWorkflowSteps(inputSteps);
    if (!validateOutputDirectory(runtimeConfig.outputDirectory)) {
      return {
        success: false,
        error: "Output directory validation failed",
      };
    }

    if (!validateAudioFiles(steps)) {
      return {
        success: false,
        error: "Audio file validation failed",
      };
    }

    const now = new Date();
    const dateFolder = generateDateFolder(now);
    const outputDirectory = path.join(runtimeConfig.outputDirectory, dateFolder);
    if (!fs.existsSync(outputDirectory)) {
      fs.mkdirSync(outputDirectory, { recursive: true });
    }

    const outputFileName = generateOutputFileName(now);
    const outputPath = path.join(outputDirectory, outputFileName);

    const processor = dependencies?.processor || { combineAudioFiles };
    const result = await processor.combineAudioFiles(
      steps,
      outputPath,
      runtimeConfig.projectResourcesPath,
    );

    const generatedAudio: GeneratedMeditationAudio = {
      ...result,
      outputDirectory,
      outputFileName,
    };

    logger.info(`Generated final meditation audio: ${generatedAudio.outputPath}`);
    return {
      success: true,
      generatedAudio,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error(`Audio workflow failed: ${errorMessage}`);
    return {
      success: false,
      error: errorMessage,
    };
  }
}
