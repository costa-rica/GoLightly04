import {
  User,
  Meditation,
  ContractUsersMeditations,
  ContractUserMeditationsListen,
  ContractMeditationsElevenLabsFiles,
  ElevenLabsFiles,
  Queue,
  sequelize,
} from "@golightly/db-models";
import { Op } from "sequelize";
import path from "path";
import fs from "fs";
import logger from "./logger";
import { AppError, ErrorCodes } from "./errorHandler";

/**
 * Result returned by deleteUser function
 */
export interface DeleteUserResult {
  userId: number;
  meditationsDeleted: number;
  elevenLabsFilesDeleted: number;
  benevolentUserCreated: boolean;
}

/**
 * ElevenLabs file with full path for deletion
 */
interface ElevenLabsFileToDelete {
  id: number;
  fullPath: string;
}

/**
 * Delete a user and all associated data
 *
 * @param userId - The user ID to delete
 * @param savePublicMeditationsAsBenevolentUser - If true, preserve public meditations and convert user to benevolent user
 * @returns DeleteUserResult with counts of deleted items
 */
export async function deleteUser(
  userId: number,
  savePublicMeditationsAsBenevolentUser: boolean = false,
): Promise<DeleteUserResult> {
  logger.info(`Initiating user deletion for user ID: ${userId}`);

  // Step 1: Validate user exists
  const user = await User.findByPk(userId);
  if (!user) {
    throw new AppError(ErrorCodes.USER_NOT_FOUND, "User not found", 404);
  }

  // Step 2: Get all meditations associated with this user
  const userMeditationsContracts = await ContractUsersMeditations.findAll({
    where: { userId },
    attributes: ["meditationId"],
  });

  const allUserMeditationIds = userMeditationsContracts.map(
    (contract) => contract.get("meditationId") as number,
  );

  // Step 3: Filter meditations based on savePublicMeditationsAsBenevolentUser
  let userDeleteMeditationIdsArray: number[] = [];

  if (allUserMeditationIds.length > 0) {
    if (savePublicMeditationsAsBenevolentUser) {
      // Only delete private meditations
      const privateMeditations = await Meditation.findAll({
        where: {
          id: { [Op.in]: allUserMeditationIds },
          visibility: "private",
        },
        attributes: ["id"],
      });

      userDeleteMeditationIdsArray = privateMeditations.map(
        (meditation) => meditation.get("id") as number,
      );

      logger.info(
        `Found ${userDeleteMeditationIdsArray.length} private meditation(s) to delete for user ${userId}`,
      );
    } else {
      // Delete all meditations
      userDeleteMeditationIdsArray = allUserMeditationIds;
      logger.info(
        `Found ${userDeleteMeditationIdsArray.length} meditation(s) to delete for user ${userId}`,
      );
    }
  } else {
    logger.info(`User ${userId} has no meditations to delete`);
  }

  // Step 4: Get ElevenLabs file IDs associated with meditations to delete
  let elevenLabsFileIdsArray: number[] = [];

  if (userDeleteMeditationIdsArray.length > 0) {
    const elevenLabsContracts =
      await ContractMeditationsElevenLabsFiles.findAll({
        where: {
          meditationId: { [Op.in]: userDeleteMeditationIdsArray },
        },
        attributes: ["elevenLabsFileId"],
      });

    // Get unique ElevenLabs file IDs
    const uniqueIds = new Set<number>();
    elevenLabsContracts.forEach((contract) => {
      const fileId = contract.get("elevenLabsFileId") as number;
      uniqueIds.add(fileId);
    });

    elevenLabsFileIdsArray = Array.from(uniqueIds);
    logger.info(
      `Found ${elevenLabsFileIdsArray.length} ElevenLabs file(s) associated with meditations to delete`,
    );
  } else {
    logger.info(`No meditations to delete, skipping ElevenLabs file lookup`);
  }

  // Step 5: Get ElevenLabs file paths
  let elevenLabsFilesToDelete: ElevenLabsFileToDelete[] = [];

  if (elevenLabsFileIdsArray.length > 0) {
    const elevenLabsFiles = await ElevenLabsFiles.findAll({
      where: {
        id: { [Op.in]: elevenLabsFileIdsArray },
      },
      attributes: ["id", "filePath", "filename"],
    });

    elevenLabsFilesToDelete = elevenLabsFiles.map((file) => {
      const fileId = file.get("id") as number;
      const filePath = file.get("filePath") as string;
      const filename = file.get("filename") as string;
      const fullPath = path.join(filePath, filename);

      return {
        id: fileId,
        fullPath,
      };
    });

    logger.info(
      `Retrieved file paths for ${elevenLabsFilesToDelete.length} ElevenLabs file(s)`,
    );
  } else {
    logger.info(`No ElevenLabs files to retrieve paths for`);
  }

  // PHASE 2: Filesystem Cleanup

  // Step 6: Delete ElevenLabs files from filesystem
  let elevenLabsFilesDeletedCount = 0;

  for (const file of elevenLabsFilesToDelete) {
    try {
      if (fs.existsSync(file.fullPath)) {
        fs.unlinkSync(file.fullPath);
        logger.info(`Deleted ElevenLabs file: ${file.fullPath}`);
        elevenLabsFilesDeletedCount++;
      } else {
        logger.warn(`ElevenLabs file not found, skipping: ${file.fullPath}`);
      }
    } catch (error: any) {
      logger.error(
        `Failed to delete ElevenLabs file ${file.fullPath}: ${error.message}`,
      );
      // Continue processing even if file deletion fails
    }
  }

  logger.info(
    `Deleted ${elevenLabsFilesDeletedCount} of ${elevenLabsFilesToDelete.length} ElevenLabs file(s)`,
  );

  // Step 7: Delete meditation MP3 files from filesystem
  let meditationFilesDeletedCount = 0;

  if (userDeleteMeditationIdsArray.length > 0) {
    const meditationsToDelete = await Meditation.findAll({
      where: {
        id: { [Op.in]: userDeleteMeditationIdsArray },
      },
      attributes: ["id", "filePath", "filename"],
    });

    for (const meditation of meditationsToDelete) {
      try {
        const dbFilePath = meditation.get("filePath") as string | null;
        const filename = meditation.get("filename") as string | null;

        if (filename) {
          let fullPath: string;

          if (dbFilePath) {
            fullPath = path.join(dbFilePath, filename);
          } else {
            const outputPath = process.env.PATH_MP3_OUTPUT;
            if (!outputPath) {
              logger.warn(
                `PATH_MP3_OUTPUT not configured, skipping meditation file deletion for meditation ${meditation.get("id")}`,
              );
              continue;
            }
            fullPath = path.join(outputPath, filename);
          }

          if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
            logger.info(`Deleted meditation file: ${fullPath}`);
            meditationFilesDeletedCount++;
          } else {
            logger.warn(`Meditation file not found, skipping: ${fullPath}`);
          }
        }
      } catch (error: any) {
        logger.error(
          `Failed to delete meditation file for meditation ${meditation.get("id")}: ${error.message}`,
        );
        // Continue processing even if file deletion fails
      }
    }

    logger.info(
      `Deleted ${meditationFilesDeletedCount} of ${meditationsToDelete.length} meditation MP3 file(s)`,
    );
  }

  // PHASE 3: Database Cleanup

  let meditationsDeletedCount = 0;
  let benevolentUserCreated = false;

  const transaction = await sequelize.transaction();

  try {
    // Step 8: Delete ElevenLabsFiles records
    if (elevenLabsFileIdsArray.length > 0) {
      const deletedElevenLabsCount = await ElevenLabsFiles.destroy({
        where: {
          id: { [Op.in]: elevenLabsFileIdsArray },
        },
        transaction,
      });
      logger.info(
        `Deleted ${deletedElevenLabsCount} ElevenLabs file record(s) from database`,
      );
    }

    // Step 9: Delete Meditation records (cascades to contract tables)
    if (userDeleteMeditationIdsArray.length > 0) {
      meditationsDeletedCount = await Meditation.destroy({
        where: {
          id: { [Op.in]: userDeleteMeditationIdsArray },
        },
        transaction,
      });
      logger.info(
        `Deleted ${meditationsDeletedCount} meditation record(s) from database (cascade deletes contract tables)`,
      );
    }

    // Step 10: Delete all user's listen records
    const deletedListenCount = await ContractUserMeditationsListen.destroy({
      where: {
        userId,
      },
      transaction,
    });
    logger.info(
      `Deleted ${deletedListenCount} listen record(s) for user ${userId}`,
    );

    // Step 11: Delete queue records
    const deletedQueueCount = await Queue.destroy({
      where: {
        userId,
      },
      transaction,
    });
    logger.info(
      `Deleted ${deletedQueueCount} queue record(s) for user ${userId}`,
    );

    // Step 12: Handle user record
    if (savePublicMeditationsAsBenevolentUser) {
      // Convert to benevolent user
      await User.update(
        {
          email: `BenevolentUser${userId}@go-lightly.love`,
          isAdmin: false,
        },
        {
          where: { id: userId },
          transaction,
        },
      );
      benevolentUserCreated = true;
      logger.info(
        `User ${userId} converted to benevolent user: BenevolentUser${userId}@go-lightly.love`,
      );
    } else {
      // Delete user completely
      await User.destroy({
        where: { id: userId },
        transaction,
      });
      logger.info(`Deleted user record for user ${userId}`);
    }

    // Commit transaction
    await transaction.commit();

    logger.info(`User deletion completed successfully for user ID: ${userId}`);

    return {
      userId,
      meditationsDeleted: meditationsDeletedCount,
      elevenLabsFilesDeleted: elevenLabsFilesDeletedCount,
      benevolentUserCreated,
    };
  } catch (error: any) {
    // Rollback transaction on error
    await transaction.rollback();
    logger.error(`Failed to delete user ${userId}: ${error.message}`);
    throw error;
  }
}
