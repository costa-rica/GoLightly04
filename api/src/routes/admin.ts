import { Router, Request, Response, NextFunction } from "express";
import {
  User,
  Meditation,
  ContractUserMeditationsListen,
  Queue,
  sequelize,
} from "@golightly/db-models";
import { authMiddleware } from "../modules/authMiddleware";
import { AppError, ErrorCodes } from "../modules/errorHandler";
import logger from "../modules/logger";
import { checkUserHasPublicMeditations } from "../modules/userPublicMeditations";
import { deleteUser } from "../modules/deleteUser";
import fs from "fs";
import path from "path";

const router = Router();

// Apply authentication middleware to all routes
router.use(authMiddleware);

// Middleware to check if user is admin
const adminMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      throw new AppError(
        ErrorCodes.AUTH_FAILED,
        "Authentication required",
        401,
      );
    }

    // Find user and check isAdmin status
    const user = await User.findByPk(userId);

    if (!user) {
      throw new AppError(ErrorCodes.AUTH_FAILED, "User not found", 401);
    }

    const isAdmin = user.get("isAdmin") as boolean;

    if (!isAdmin) {
      throw new AppError(
        ErrorCodes.UNAUTHORIZED_ACCESS,
        "Admin access required",
        403,
      );
    }

    next();
  } catch (error: any) {
    if (error instanceof AppError) {
      next(error);
    } else {
      logger.error(`Admin middleware error: ${error.message}`);
      next(
        new AppError(
          ErrorCodes.INTERNAL_ERROR,
          "Failed to verify admin status",
          500,
          error.message,
        ),
      );
    }
  }
};

// Apply admin middleware to all routes
router.use(adminMiddleware);

// GET /admin/users
router.get(
  "/users",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Query all users excluding password field
      const users = await User.findAll({
        attributes: [
          "id",
          "email",
          "isEmailVerified",
          "emailVerifiedAt",
          "isAdmin",
          "createdAt",
          "updatedAt",
        ],
      });

      // Add hasPublicMeditations to each user
      const usersWithPublicMeditations = await Promise.all(
        users.map(async (user) => {
          const userId = user.get("id") as number;
          const hasPublicMeditations =
            await checkUserHasPublicMeditations(userId);

          return {
            ...user.get({ plain: true }),
            hasPublicMeditations,
          };
        }),
      );

      logger.info(
        `Admin user ${req.user?.userId} retrieved ${users.length} users`,
      );

      res.status(200).json({
        users: usersWithPublicMeditations,
      });
    } catch (error: any) {
      logger.error(`Failed to retrieve users: ${error.message}`);
      next(
        new AppError(
          ErrorCodes.INTERNAL_ERROR,
          "Failed to retrieve users",
          500,
          error.message,
        ),
      );
    }
  },
);

// GET /admin/meditations
router.get(
  "/meditations",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Get ALL meditations regardless of visibility
      const meditations = await Meditation.findAll();

      // Calculate listens for each meditation
      const meditationsWithListens = await Promise.all(
        meditations.map(async (meditation) => {
          const meditationId = meditation.get("id") as number;

          // Get all listen records for this meditation
          const listenRecords = await ContractUserMeditationsListen.findAll({
            where: {
              meditationId,
            },
          });

          // Sum up the listen counts
          const totalListens = listenRecords.reduce(
            (sum: number, record: any) => {
              const listenCount = record.get("listenCount") as number;
              return sum + (listenCount || 0);
            },
            0,
          );

          // Return meditation with all fields plus listens
          return {
            ...meditation.get({ plain: true }),
            listens: totalListens,
          };
        }),
      );

      logger.info(
        `Admin user ${req.user?.userId} retrieved ${meditationsWithListens.length} meditations (all)`,
      );

      res.status(200).json({
        meditations: meditationsWithListens,
      });
    } catch (error: any) {
      logger.error(`Failed to retrieve meditations: ${error.message}`);
      next(
        new AppError(
          ErrorCodes.INTERNAL_ERROR,
          "Failed to retrieve meditations",
          500,
          error.message,
        ),
      );
    }
  },
);

// DELETE /admin/meditations/:meditationId
router.delete(
  "/meditations/:meditationId",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const meditationId = parseInt(req.params.meditationId, 10);

      // Validate ID
      if (isNaN(meditationId)) {
        throw new AppError(
          ErrorCodes.VALIDATION_ERROR,
          "Invalid meditation ID",
          400,
        );
      }

      // Find meditation in database
      const meditation = await Meditation.findByPk(meditationId);

      if (!meditation) {
        throw new AppError(
          ErrorCodes.MANTRA_NOT_FOUND,
          "Meditation not found",
          404,
        );
      }

      // Get file path components from database
      const dbFilePath = meditation.get("filePath") as string | null;
      const filename = meditation.get("filename") as string | null;

      // Delete MP3 file if it exists
      if (filename) {
        let fullFilePath: string;

        if (dbFilePath) {
          // If DB has directory path, combine with filename
          fullFilePath = path.join(dbFilePath, filename);
        } else {
          // Fallback to PATH_MP3_OUTPUT + filename
          const outputPath = process.env.PATH_MP3_OUTPUT;
          if (!outputPath) {
            throw new AppError(
              ErrorCodes.INTERNAL_ERROR,
              "Meditation output path not configured",
              500,
            );
          }
          fullFilePath = path.join(outputPath, filename);
        }

        if (fs.existsSync(fullFilePath)) {
          try {
            fs.unlinkSync(fullFilePath);
            logger.info(`Admin deleted meditation file: ${fullFilePath}`);
          } catch (error: any) {
            logger.error(
              `Failed to delete meditation file ${fullFilePath}: ${error.message}`,
            );
            throw new AppError(
              ErrorCodes.INTERNAL_ERROR,
              "Failed to delete meditation file",
              500,
              error.message,
            );
          }
        } else {
          logger.warn(
            `Meditation file not found for deletion: ${fullFilePath}. Proceeding with database deletion.`,
          );
        }
      }

      // Delete listen/favorite rows first because the live SQLite schema
      // uses ON DELETE NO ACTION for contract_user_meditation_listens.
      await sequelize.transaction(async (transaction) => {
        await ContractUserMeditationsListen.destroy({
          where: { meditationId },
          transaction,
        });

        await meditation.destroy({ transaction });
      });

      logger.info(
        `Admin user ${req.user?.userId} deleted meditation ${meditationId}`,
      );

      res.status(200).json({
        message: "Meditation deleted successfully",
        meditationId,
      });
    } catch (error: any) {
      if (error instanceof AppError) {
        next(error);
      } else {
        logger.error(
          `Failed to delete meditation ${req.params.meditationId}: ${error.message}`,
        );
        next(
          new AppError(
            ErrorCodes.INTERNAL_ERROR,
            "Failed to delete meditation",
            500,
            error.message,
          ),
        );
      }
    }
  },
);

// GET /admin/queuer
router.get(
  "/queuer",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Query all queue records
      const queueRecords = await Queue.findAll({
        order: [["id", "DESC"]], // Most recent first
      });

      logger.info(
        `Admin user ${req.user?.userId} retrieved ${queueRecords.length} queue records`,
      );

      res.status(200).json({
        queue: queueRecords,
      });
    } catch (error: any) {
      logger.error(`Failed to retrieve queue records: ${error.message}`);
      next(
        new AppError(
          ErrorCodes.INTERNAL_ERROR,
          "Failed to retrieve queue records",
          500,
          error.message,
        ),
      );
    }
  },
);

// DELETE /admin/users/:userId
router.delete(
  "/users/:userId",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = parseInt(req.params.userId, 10);

      // Validate userId is a valid number
      if (isNaN(userId)) {
        throw new AppError(ErrorCodes.VALIDATION_ERROR, "Invalid user ID", 400);
      }

      // Extract savePublicMeditationsAsBenevolentUser from request body (default: false)
      const savePublicMeditationsAsBenevolentUser =
        req.body.savePublicMeditationsAsBenevolentUser === true;

      logger.info(
        `Admin user ${req.user?.userId} initiated deletion of user ${userId}`,
      );

      // Call deleteUser module
      const result = await deleteUser(
        userId,
        savePublicMeditationsAsBenevolentUser,
      );

      res.status(200).json({
        message: "User deleted successfully",
        userId: result.userId,
        meditationsDeleted: result.meditationsDeleted,
        elevenLabsFilesDeleted: result.elevenLabsFilesDeleted,
        benevolentUserCreated: result.benevolentUserCreated,
      });
    } catch (error: any) {
      if (error instanceof AppError) {
        next(error);
      } else {
        logger.error(
          `Failed to delete user ${req.params.userId}: ${error.message}`,
        );
        next(
          new AppError(
            ErrorCodes.INTERNAL_ERROR,
            "Failed to delete user",
            500,
            error.message,
          ),
        );
      }
    }
  },
);

export default router;
