import logger from "./logger";
import {
  MeditationRequestBody,
  MeditationArrayElement,
  WorkflowResult,
} from "../types";
import { parseCsvFile, parseMeditationArray } from "./csvParser";
import { addJobToQueue, updateJobStatus } from "./queueManager";
import { generateJobFilename } from "./fileManager";
import { writeJobCsv } from "./csvWriter";
import { runElevenLabsWorkflow } from "./elevenLabsHandler";
import { runAudioConcatenatorWorkflow } from "./audioConcatenatorHandler";
import { saveMeditationToDatabase } from "./meditationsManager";
import {
  saveElevenLabsFilesToDatabase,
  linkMeditationToElevenLabsFiles,
} from "./elevenLabsFilesManager";
import {
  findSoundFilesInMeditation,
  linkMeditationToSoundFiles,
} from "./soundFilesManager";

/**
 * Main workflow orchestrator for meditation creation
 * @param requestBody - Request body containing userId and either filenameCsv or meditationArray
 * @returns Workflow result with final file path
 */
export async function orchestrateMeditationCreation(
  requestBody: MeditationRequestBody,
): Promise<WorkflowResult> {
  const { userId, filenameCsv, meditationArray, title, description } = requestBody;

  logger.info(`Starting meditation creation workflow for user ${userId}`);

  let queueId: number | undefined;
  let elevenLabsFileIds: number[] = [];
  let soundFileIds: number[] = [];

  try {
    // Step 1: Parse input (filenameCsv or meditationArray)
    logger.info("Step 1: Parsing input data");
    let meditationElements: MeditationArrayElement[];

    if (filenameCsv) {
      logger.info(`Parsing CSV file: ${filenameCsv}`);
      meditationElements = parseCsvFile(filenameCsv);
    } else if (meditationArray) {
      logger.info(
        `Parsing meditation array with ${meditationArray.length} elements`,
      );
      meditationElements = parseMeditationArray(meditationArray);
    } else {
      throw new Error("Either filenameCsv or meditationArray must be provided");
    }

    logger.info(`Parsed ${meditationElements.length} meditation elements`);

    // Find any sound files referenced in the meditation elements
    logger.info("Finding sound files referenced in meditation elements");
    soundFileIds = await findSoundFilesInMeditation(meditationElements);
    if (soundFileIds.length > 0) {
      logger.info(`Found ${soundFileIds.length} sound file references`);
    }

    // Step 2: Create and save queue record (status: "queued")
    logger.info("Step 2: Creating queue record");
    const jobFilename = generateJobFilename(userId);

    // Write job CSV file to PATH_QUEUER/YYYYMMDD/ subdirectory
    logger.info("Writing job CSV file to disk");
    writeJobCsv(jobFilename, meditationElements);

    const queueRecord = await addJobToQueue(userId, jobFilename);
    queueId = queueRecord.id!;

    logger.info(`Queue record created with ID: ${queueId}`);

    // Step 3: Update status to "started"
    logger.info("Step 3: Updating status to started");
    await updateJobStatus(queueId, "started");

    // Step 4-7: Run ElevenLabs workflow
    logger.info("Step 4-7: Running ElevenLabs workflow");
    await updateJobStatus(queueId, "elevenlabs");

    const elevenLabsFiles = await runElevenLabsWorkflow(meditationElements);

    logger.info(
      `ElevenLabs workflow completed with ${elevenLabsFiles.length} files`,
    );

    // Save ElevenLabsFiles records to database
    if (elevenLabsFiles.length > 0) {
      logger.info("Saving ElevenLabsFiles records to database");
      elevenLabsFileIds = await saveElevenLabsFilesToDatabase(
        elevenLabsFiles,
        meditationElements,
      );
      logger.info(
        `ElevenLabsFiles records saved successfully with IDs: ${elevenLabsFileIds.join(", ")}`,
      );
    }

    // Step 8-11: Run AudioConcatenator workflow
    logger.info("Step 8-11: Running AudioConcatenator workflow");
    await updateJobStatus(queueId, "concatenator");

    const finalFilePath = await runAudioConcatenatorWorkflow(
      meditationElements,
      elevenLabsFiles,
    );

    logger.info(`AudioConcatenator workflow completed: ${finalFilePath}`);

    // Save Meditation to database and link to user
    logger.info("Saving meditation to database");
    const meditation = await saveMeditationToDatabase(finalFilePath, userId, title, description);
    logger.info(`Meditation saved to database with ID: ${meditation.id}`);

    // Link Meditation to ElevenLabsFiles records
    if (elevenLabsFileIds.length > 0) {
      logger.info("Linking Meditation to ElevenLabsFiles records");
      await linkMeditationToElevenLabsFiles(meditation.id, elevenLabsFileIds);
      logger.info("Meditation successfully linked to ElevenLabsFiles records");
    }

    // Link Meditation to SoundFiles records
    if (soundFileIds.length > 0) {
      logger.info("Linking Meditation to SoundFiles records");
      await linkMeditationToSoundFiles(meditation.id, soundFileIds);
      logger.info("Meditation successfully linked to SoundFiles records");
    }

    // Step 12: Update status to "done"
    logger.info("Step 12: Updating status to done");
    await updateJobStatus(queueId, "done");

    // Step 13: Return final file path
    logger.info(
      `Meditation creation workflow completed successfully: ${finalFilePath}`,
    );

    return {
      success: true,
      queueId,
      finalFilePath,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    logger.error(`Workflow failed: ${errorMessage}`, error);

    // Update queue status to reflect error if queueId exists
    if (queueId) {
      try {
        // We could add an 'error' or 'failed' status, but for now leave it at current status
        logger.error(`Workflow failed at queue ${queueId}`);
      } catch (updateError) {
        logger.error("Failed to update queue status after error:", updateError);
      }
    }

    return {
      success: false,
      queueId: queueId || -1,
      error: errorMessage,
    };
  }
}
