import logger from "./logger";
import { SoundFiles, ContractMeditationsSoundFiles } from "./database";
import { MeditationArrayElement } from "../types";

/**
 * Find SoundFiles IDs based on sound file filenames from meditation elements
 * @param meditationElements - Original meditation elements that may contain sound_file references
 * @returns Array of SoundFiles IDs that were referenced in the meditation
 */
export async function findSoundFilesInMeditation(
  meditationElements: MeditationArrayElement[],
): Promise<number[]> {
  logger.info("Finding sound files referenced in meditation elements");

  // Filter meditation elements to only those with sound_file
  const soundFileElements = meditationElements.filter(
    (element) => element.sound_file && element.sound_file.trim() !== "",
  );

  if (soundFileElements.length === 0) {
    logger.info("No sound files found in meditation elements");
    return [];
  }

  logger.info(
    `Found ${soundFileElements.length} sound file references in meditation elements`,
  );

  const soundFileIds: number[] = [];

  // Find each sound file in the database
  for (const element of soundFileElements) {
    const filename = element.sound_file!;

    try {
      // Look up the sound file by filename
      const soundFile = await SoundFiles.findOne({
        where: { filename },
      });

      if (soundFile) {
        soundFileIds.push(soundFile.id);
        logger.info(
          `Found SoundFiles record ${soundFile.id} for filename: ${filename}`,
        );
      } else {
        logger.warn(`SoundFiles record not found for filename: ${filename}`);
      }
    } catch (error) {
      logger.error(`Failed to find SoundFiles record for ${filename}:`, error);
      throw error;
    }
  }

  logger.info(`Successfully found ${soundFileIds.length} SoundFiles records`);

  // Deduplicate sound file IDs (same sound file may be used multiple times in one meditation)
  const uniqueSoundFileIds = Array.from(new Set(soundFileIds));

  if (uniqueSoundFileIds.length < soundFileIds.length) {
    logger.info(
      `Deduplicated ${soundFileIds.length} references to ${uniqueSoundFileIds.length} unique SoundFiles`,
    );
  }

  return uniqueSoundFileIds;
}

/**
 * Link Meditation to SoundFiles records via ContractMeditationsSoundFiles
 * @param meditationId - ID of the Meditation record
 * @param soundFileIds - Array of SoundFiles IDs to link
 * @returns Array of created ContractMeditationsSoundFiles record IDs
 */
export async function linkMeditationToSoundFiles(
  meditationId: number,
  soundFileIds: number[],
): Promise<number[]> {
  logger.info(
    `Linking Meditation ${meditationId} to ${soundFileIds.length} SoundFiles records`,
  );

  const createdIds: number[] = [];

  // Create a contract record for each SoundFiles ID
  for (const soundFilesId of soundFileIds) {
    try {
      const contract = await ContractMeditationsSoundFiles.create({
        meditationId,
        soundFilesId,
      });

      createdIds.push(contract.id);
      logger.info(
        `Created ContractMeditationsSoundFiles record ${contract.id}: meditationId=${meditationId}, soundFilesId=${soundFilesId}`,
      );
    } catch (error) {
      logger.error(
        `Failed to create ContractMeditationsSoundFiles for meditationId=${meditationId}, soundFilesId=${soundFilesId}:`,
        error,
      );
      throw error;
    }
  }

  logger.info(
    `Successfully linked Meditation ${meditationId} to ${createdIds.length} SoundFiles records`,
  );

  return createdIds;
}
