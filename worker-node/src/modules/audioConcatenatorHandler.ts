import * as path from "path";
import logger from "./logger";
import {
  AudioWorkflowInputStep,
  AudioWorkflowResult,
  MeditationArrayElement,
} from "../types";
import { processAudioSequence } from "./audio";

export function createInternalAudioWorkflowSteps(
  meditationElements: MeditationArrayElement[],
  elevenLabsFiles: string[],
): AudioWorkflowInputStep[] {
  const steps: AudioWorkflowInputStep[] = [];
  let elevenLabsFileIndex = 0;

  for (const element of meditationElements) {
    if (element.text && element.text.trim() !== "") {
      if (elevenLabsFileIndex < elevenLabsFiles.length) {
        steps.push({
          id: element.id,
          audioFilePath: elevenLabsFiles[elevenLabsFileIndex],
        });
        elevenLabsFileIndex += 1;
      } else {
        logger.warn(
          `No ElevenLabs file found for element ${element.id} (text: "${element.text}")`,
        );
      }
    } else if (element.pause_duration) {
      steps.push({
        id: element.id,
        pauseDuration: Number(element.pause_duration),
      });
    } else if (element.sound_file) {
      steps.push({
        id: element.id,
        audioFilePath: path.join(process.env.PATH_MP3_SOUND_FILES!, element.sound_file),
      });
    }
  }

  return steps;
}

export async function runInternalAudioConcatenatorWorkflow(
  meditationElements: MeditationArrayElement[],
  elevenLabsFiles: string[],
): Promise<AudioWorkflowResult> {
  const steps = createInternalAudioWorkflowSteps(
    meditationElements,
    elevenLabsFiles,
  );

  return processAudioSequence(steps);
}

export async function runAudioConcatenatorWorkflow(
  meditationElements: MeditationArrayElement[],
  elevenLabsFiles: string[],
): Promise<string> {
  const result = await runInternalAudioConcatenatorWorkflow(
    meditationElements,
    elevenLabsFiles,
  );

  if (!result.success || !result.generatedAudio) {
    throw new Error(result.error || "Audio concatenation workflow failed");
  }

  return result.generatedAudio.outputPath;
}
