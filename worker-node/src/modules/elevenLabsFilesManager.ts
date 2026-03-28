import * as path from "path";
import logger from "./logger";
import {
  ElevenLabsFiles,
  ContractMeditationsElevenLabsFiles,
} from "./database";
import { MeditationArrayElement } from "../types";

/**
 * Parse file path into filename and directory path
 * @param fullPath - Complete file path from ElevenLabs output
 * @returns Object with filename and filePath
 */
export function parseFilePath(fullPath: string): {
  filename: string;
  filePath: string;
} {
  const filename = path.basename(fullPath);
  const directory = path.dirname(fullPath);
  // Add trailing slash to directory path for consistency
  const filePath = directory.endsWith("/") ? directory : `${directory}/`;

  return { filename, filePath };
}

/**
 * Save ElevenLabsFiles records to database
 * @param generatedFilePaths - Array of full file paths from ElevenLabs output
 * @param meditationElements - Original meditation elements with text
 * @returns Array of created ElevenLabsFiles record IDs
 */
export async function saveElevenLabsFilesToDatabase(
  generatedFilePaths: string[],
  meditationElements: MeditationArrayElement[],
): Promise<number[]> {
  logger.info(
    `Saving ${generatedFilePaths.length} ElevenLabsFiles records to database`,
  );

  // Filter meditation elements to only those with text (in order)
  const textElements = meditationElements.filter(
    (element) => element.text && element.text.trim() !== "",
  );

  // Validate that we have matching counts
  if (generatedFilePaths.length !== textElements.length) {
    logger.warn(
      `Mismatch between generated files (${generatedFilePaths.length}) and text elements (${textElements.length})`,
    );
  }

  const createdIds: number[] = [];

  // Create database records for each file
  for (let i = 0; i < generatedFilePaths.length; i++) {
    const fullPath = generatedFilePaths[i];
    const textElement = textElements[i]; // Corresponding text element

    // Parse the file path
    const { filename, filePath } = parseFilePath(fullPath);

    try {
      // Create database record
      const record = await ElevenLabsFiles.create({
        filename,
        filePath,
        text: textElement?.text || "", // Use the original text from the meditation element
      });

      createdIds.push(record.id);
      logger.info(`Created ElevenLabsFiles record ${record.id}: ${filename}`);
    } catch (error) {
      logger.error(
        `Failed to create ElevenLabsFiles record for ${filename}:`,
        error,
      );
      throw error;
    }
  }

  logger.info(
    `Successfully saved ${createdIds.length} ElevenLabsFiles records`,
  );

  return createdIds;
}

/**
 * Link Meditation to ElevenLabsFiles records via ContractMeditationsElevenLabsFiles
 * @param meditationId - ID of the Meditation record
 * @param elevenLabsFileIds - Array of ElevenLabsFiles IDs to link
 * @returns Array of created ContractMeditationsElevenLabsFiles record IDs
 */
export async function linkMeditationToElevenLabsFiles(
  meditationId: number,
  elevenLabsFileIds: number[],
): Promise<number[]> {
  logger.info(
    `Linking Meditation ${meditationId} to ${elevenLabsFileIds.length} ElevenLabsFiles records`,
  );

  const createdIds: number[] = [];

  // Create a contract record for each ElevenLabsFiles ID
  for (const elevenLabsFilesId of elevenLabsFileIds) {
    try {
      const contract = await ContractMeditationsElevenLabsFiles.create({
        meditationId,
        elevenLabsFilesId,
      });

      createdIds.push(contract.id);
      logger.info(
        `Created ContractMeditationsElevenLabsFiles record ${contract.id}: meditationId=${meditationId}, elevenLabsFilesId=${elevenLabsFilesId}`,
      );
    } catch (error) {
      logger.error(
        `Failed to create ContractMeditationsElevenLabsFiles for meditationId=${meditationId}, elevenLabsFilesId=${elevenLabsFilesId}:`,
        error,
      );
      throw error;
    }
  }

  logger.info(
    `Successfully linked Meditation ${meditationId} to ${createdIds.length} ElevenLabsFiles records`,
  );

  return createdIds;
}
