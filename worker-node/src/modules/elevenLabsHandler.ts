import logger from "./logger";
import {
  ElevenLabsGeneratedFile,
  MeditationArrayElement,
  ElevenLabsRequest,
} from "../types";
import {
  processElevenLabsBatch,
} from "./elevenlabs";

export function createInternalElevenLabsRequests(
  meditationElements: MeditationArrayElement[],
): ElevenLabsRequest[] {
  return meditationElements
    .filter((element) => element.text && element.text.trim() !== "")
    .map((element) => ({
      id: element.id,
      text: element.text!.trim(),
      voiceId: element.voice_id?.toString().trim() || "",
      speed:
        element.speed === undefined || element.speed === ""
          ? Number.NaN
          : Number(element.speed),
    }));
}

export async function runInternalElevenLabsWorkflow(
  meditationElements: MeditationArrayElement[],
): Promise<ElevenLabsGeneratedFile[]> {
  const requests = createInternalElevenLabsRequests(meditationElements);
  const batchResult = await processElevenLabsBatch({
    requests,
  });

  const failures = batchResult.results.filter((result) => !result.success);
  if (failures.length > 0) {
    throw new Error(failures[0]?.error || "ElevenLabs batch processing failed");
  }

  const generatedFiles = batchResult.results
    .map((result) => result.generatedFile)
    .filter((result): result is ElevenLabsGeneratedFile => Boolean(result));

  logger.info(
    `ElevenLabs internal workflow completed with ${generatedFiles.length} generated files`,
  );

  return generatedFiles;
}

export async function runElevenLabsWorkflow(
  meditationElements: MeditationArrayElement[],
): Promise<string[]> {
  const generatedFiles = await runInternalElevenLabsWorkflow(meditationElements);
  return generatedFiles.map((file) => file.filePath);
}
