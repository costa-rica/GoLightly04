import { Router, Request, Response, NextFunction } from "express";
import {
  Meditation,
  ContractUsersMeditations,
  ContractUserMeditationsListen,
  sequelize,
} from "@golightly/db-models";
import { Op } from "sequelize";
import { authMiddleware } from "../modules/authMiddleware";
import { optionalAuthMiddleware } from "../modules/optionalAuthMiddleware";
import { AppError, ErrorCodes } from "../modules/errorHandler";
import logger from "../modules/logger";
import fs from "fs";
import path from "path";

// Interface for queuer response
interface QueuerResponse {
  success: boolean;
  queueId?: number;
  finalFilePath?: string;
  message?: string;
}

const router = Router();

// GET /meditations/:id/stream - Stream meditation MP3 file (optional authentication)
router.get(
  "/:id/stream",
  optionalAuthMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const meditationId = parseInt(req.params.id, 10);

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

      const visibility = meditation.get("visibility") as string;

      // Authorization check for private meditations
      if (visibility === "private") {
        // Private meditations require authentication
        if (!req.user) {
          throw new AppError(
            ErrorCodes.AUTH_FAILED,
            "Authentication required to access private meditations",
            401,
          );
        }

        // Verify ownership via ContractUsersMeditations
        const ownership = await ContractUsersMeditations.findOne({
          where: {
            userId: req.user.userId,
            meditationId: meditationId,
          },
        });

        if (!ownership) {
          throw new AppError(
            ErrorCodes.UNAUTHORIZED_ACCESS,
            "You do not have permission to access this meditation",
            403,
          );
        }
      }

      // Get file path components from database
      const dbFilePath = meditation.get("filePath") as string | null; // Directory path with trailing slash
      const filename = meditation.get("filename") as string | null;

      if (!filename) {
        throw new AppError(
          ErrorCodes.INTERNAL_ERROR,
          "Meditation file information not found",
          500,
        );
      }

      // Construct full file path
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

      // Verify file exists
      if (!fs.existsSync(fullFilePath)) {
        logger.error(`Meditation file not found: ${fullFilePath}`);
        throw new AppError(
          ErrorCodes.MANTRA_NOT_FOUND,
          "Meditation audio file not found",
          404,
        );
      }

      // Verify it's actually a file, not a directory
      const fileStats = fs.statSync(fullFilePath);
      if (!fileStats.isFile()) {
        logger.error(`Path is not a file: ${fullFilePath}`);
        throw new AppError(
          ErrorCodes.MANTRA_NOT_FOUND,
          "Meditation audio file not found",
          404,
        );
      }

      // Track listens
      if (req.user) {
        // Authenticated user - track in both tables
        const userId = req.user.userId;

        // Find or create ContractUserMeditationsListen record
        const [listenRecord, created] =
          await ContractUserMeditationsListen.findOrCreate({
            where: {
              userId,
              meditationId,
            },
            defaults: {
              userId,
              meditationId,
              listenCount: 1,
            },
          });

        // If record already existed, increment listenCount
        if (!created) {
          const currentCount = listenRecord.get("listenCount") as number;
          await listenRecord.update({
            listenCount: currentCount + 1,
          });
        }

        // Increment listens in Meditations table
        const currentListens = (meditation.get("listenCount") as number) || 0;
        await meditation.update({
          listenCount: currentListens + 1,
        });

        logger.info(
          `Meditation ${meditationId} streamed by user ${userId} (listen count: ${created ? 1 : (listenRecord.get("listenCount") as number)})`,
        );
      } else {
        // Anonymous user - only track in Meditations table
        const currentListens = (meditation.get("listenCount") as number) || 0;
        await meditation.update({
          listenCount: currentListens + 1,
        });

        logger.info(`Meditation ${meditationId} streamed anonymously`);
      }

      // Get file size from stats we already have
      const fileSize = fileStats.size;

      // Parse range header for seeking support
      const range = req.headers.range;

      if (range) {
        // Parse range header (e.g., "bytes=0-1023")
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

        const chunkSize = end - start + 1;
        const fileStream = fs.createReadStream(fullFilePath, { start, end });

        res.writeHead(206, {
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": chunkSize,
          "Content-Type": "audio/mpeg",
        });

        fileStream.pipe(res);
      } else {
        // No range request, send entire file
        res.writeHead(200, {
          "Content-Length": fileSize,
          "Content-Type": "audio/mpeg",
          "Accept-Ranges": "bytes",
        });

        const fileStream = fs.createReadStream(fullFilePath);
        fileStream.pipe(res);
      }
    } catch (error: any) {
      if (error instanceof AppError) {
        next(error);
      } else {
        logger.error(
          `Failed to stream meditation ${req.params.id}: ${error.message}`,
        );
        next(
          new AppError(
            ErrorCodes.INTERNAL_ERROR,
            "Failed to stream meditation",
            500,
            error.message,
          ),
        );
      }
    }
  },
);

// GET /meditations/all - Retrieve meditations with optional authentication
router.get(
  "/all",
  optionalAuthMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      let meditations: any[];

      if (req.user) {
        // Authenticated user - get public meditations + user's private meditations
        const userMeditations = await ContractUsersMeditations.findAll({
          where: {
            userId: req.user.userId,
          },
        });

        const userMeditationIds = userMeditations.map(
          (contract) => contract.get("meditationId") as number,
        );

        // Get all public meditations with ownership info
        const publicMeditations = await Meditation.findAll({
          where: {
            visibility: { [Op.ne]: "private" },
          },
          include: [
            {
              model: ContractUsersMeditations,
              as: "contractUsersMeditations",
              required: false,
              attributes: ["userId"],
            },
          ],
        });

        // Get user's private meditations with ownership info
        const userPrivateMeditations = await Meditation.findAll({
          where: {
            id: { [Op.in]: userMeditationIds },
            visibility: "private",
          },
          include: [
            {
              model: ContractUsersMeditations,
              as: "contractUsersMeditations",
              required: false,
              attributes: ["userId"],
            },
          ],
        });

        // Combine and deduplicate
        const allMeditations = [
          ...publicMeditations,
          ...userPrivateMeditations,
        ];
        const uniqueMeditationIds = new Set<number>();
        meditations = allMeditations.filter((meditation) => {
          const id = meditation.get("id") as number;
          if (uniqueMeditationIds.has(id)) {
            return false;
          }
          uniqueMeditationIds.add(id);
          return true;
        });
      } else {
        // Anonymous user - get only public meditations with ownership info
        meditations = await Meditation.findAll({
          where: {
            visibility: { [Op.ne]: "private" },
          },
          include: [
            {
              model: ContractUsersMeditations,
              as: "contractUsersMeditations",
              required: false,
              attributes: ["userId"],
            },
          ],
        });
      }

      // Get favorite counts for all meditations
      const meditationIds = meditations.map(
        (meditation) => meditation.get("id") as number,
      );

      const favoriteCounts = await ContractUserMeditationsListen.findAll({
        where: {
          meditationId: { [Op.in]: meditationIds },
          favorite: true,
        },
        attributes: [
          "meditationId",
          [sequelize.fn("COUNT", sequelize.col("id")), "favoriteCount"],
        ],
        group: ["meditationId"],
        raw: true,
      });

      // Create a map of meditationId to favoriteCount for quick lookup
      const favoriteCountMap = new Map<number, number>();
      favoriteCounts.forEach((record: any) => {
        favoriteCountMap.set(
          record.meditationId,
          parseInt(record.favoriteCount, 10),
        );
      });

      const meditationsWithListens = meditations.map((meditation) => {
        const plainMeditation = meditation.get({ plain: true }) as {
          id: number;
          listenCount?: number | null;
          contractUsersMeditations?: Array<{ userId: number }>;
        };

        // Extract ownerUserId from contractUsersMeditations relationship
        let ownerUserId: number | string = "missing";
        if (
          plainMeditation.contractUsersMeditations &&
          plainMeditation.contractUsersMeditations.length > 0
        ) {
          ownerUserId = plainMeditation.contractUsersMeditations[0].userId;
        }

        // Remove the contractUsersMeditations array from response
        const { contractUsersMeditations: _, ...meditationWithoutContract } =
          plainMeditation;

        return {
          ...meditationWithoutContract,
          listenCount: plainMeditation.listenCount ?? 0,
          favoriteCount: favoriteCountMap.get(plainMeditation.id) ?? 0,
          ownerUserId,
        };
      });

      logger.info(
        `Meditations retrieved${req.user ? ` for user ${req.user.userId}` : " anonymously"}: ${meditationsWithListens.length} meditations`,
      );

      res.status(200).json({
        meditationsArray: meditationsWithListens,
      });
    } catch (error: any) {
      if (error instanceof AppError) {
        next(error);
      } else {
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
    }
  },
);

// Apply authentication middleware to all routes below this point
router.use(authMiddleware);

// POST /meditations/favorite/:meditationId/:trueOrFalse
router.post(
  "/favorite/:meditationId/:trueOrFalse",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const meditationId = parseInt(req.params.meditationId, 10);
      const trueOrFalse = req.params.trueOrFalse;

      // Validate meditationId
      if (isNaN(meditationId)) {
        throw new AppError(
          ErrorCodes.VALIDATION_ERROR,
          "Invalid meditation ID",
          400,
        );
      }

      // Validate trueOrFalse parameter
      if (trueOrFalse !== "true" && trueOrFalse !== "false") {
        throw new AppError(
          ErrorCodes.VALIDATION_ERROR,
          "trueOrFalse parameter must be 'true' or 'false'",
          400,
        );
      }

      const favoriteValue = trueOrFalse === "true";

      // Verify meditation exists
      const meditation = await Meditation.findByPk(meditationId);
      if (!meditation) {
        throw new AppError(
          ErrorCodes.MANTRA_NOT_FOUND,
          "Meditation not found",
          404,
        );
      }

      const userId = req.user!.userId;

      // Find or create ContractUserMeditationsListen record
      const [listenRecord, created] =
        await ContractUserMeditationsListen.findOrCreate({
          where: {
            userId,
            meditationId,
          },
          defaults: {
            userId,
            meditationId,
            listenCount: 0,
            favorite: favoriteValue,
          },
        });

      // If record already existed, update the favorite field
      if (!created) {
        await listenRecord.update({
          favorite: favoriteValue,
        });
      }

      logger.info(
        `User ${userId} ${favoriteValue ? "favorited" : "unfavorited"} meditation ${meditationId}`,
      );

      res.status(200).json({
        message: `Meditation ${favoriteValue ? "favorited" : "unfavorited"} successfully`,
        meditationId,
        favorite: favoriteValue,
      });
    } catch (error: any) {
      if (error instanceof AppError) {
        next(error);
      } else {
        logger.error(
          `Failed to update favorite for meditation ${req.params.meditationId}: ${error.message}`,
        );
        next(
          new AppError(
            ErrorCodes.INTERNAL_ERROR,
            "Failed to update favorite status",
            500,
            error.message,
          ),
        );
      }
    }
  },
);

// POST /meditations/create
router.post(
  "/create",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { meditationArray, title, description } = req.body;

      // Validate meditationArray exists
      if (!meditationArray || !Array.isArray(meditationArray)) {
        throw new AppError(
          ErrorCodes.VALIDATION_ERROR,
          "meditationArray is required and must be an array",
          400,
        );
      }

      // Log complete request in development mode
      if (process.env.NODE_ENV === "development") {
        logger.info(
          `[DEV] POST /meditations/create request body: ${JSON.stringify(req.body, null, 2)}`,
        );
      }

      // Get queuer URL from environment
      const queuerUrl = process.env.URL_MANTRIFY01QUEUER;
      if (!queuerUrl) {
        throw new AppError(
          ErrorCodes.INTERNAL_ERROR,
          "Queuer URL not configured",
          500,
        );
      }

      logger.info(
        `User ${req.user?.userId} creating meditation with ${meditationArray.length} elements`,
      );

      // Send request to queuer
      const queuerEndpoint = `${queuerUrl}/meditations/new`;
      const response = await fetch(queuerEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: req.user?.userId,
          meditationArray,
          title,
          description,
        }),
      });

      // Check if response is OK
      if (!response.ok) {
        const errorText = await response.text();
        logger.error(
          `Queuer returned error (${response.status}): ${errorText}`,
        );
        throw new AppError(
          ErrorCodes.QUEUER_ERROR,
          "Queuer service returned an error",
          response.status,
          errorText,
        );
      }

      // Parse JSON response
      const responseData = (await response.json()) as QueuerResponse;

      // Validate response structure
      if (!responseData || typeof responseData.success !== "boolean") {
        logger.error(
          `Queuer returned invalid response format: ${JSON.stringify(responseData)}`,
        );
        throw new AppError(
          ErrorCodes.QUEUER_ERROR,
          "Invalid response format from queuer service",
          500,
          JSON.stringify(responseData),
        );
      }

      // Check if queuer reported success
      if (!responseData.success) {
        logger.error(
          `Queuer reported failure: ${responseData.message || "Unknown error"}`,
        );
        throw new AppError(
          ErrorCodes.QUEUER_ERROR,
          responseData.message || "Queuer failed to process meditation",
          500,
          JSON.stringify(responseData),
        );
      }

      logger.info(
        `Meditation successfully created for user ${req.user?.userId}: queueId=${responseData.queueId}, file=${responseData.finalFilePath}`,
      );

      res.status(201).json({
        message: "Meditation created successfully",
        queueId: responseData.queueId,
        filePath: responseData.finalFilePath,
      });
    } catch (error: any) {
      if (error instanceof AppError) {
        next(error);
      } else {
        logger.error(
          `Failed to create meditation for user ${req.user?.userId}: ${error.message}`,
        );
        next(
          new AppError(
            ErrorCodes.QUEUER_ERROR,
            "Failed to communicate with queuer service",
            500,
            error.message,
          ),
        );
      }
    }
  },
);

// PATCH /meditations/update/:id
router.patch(
  "/update/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const meditationId = parseInt(req.params.id, 10);
      const { title, description, visibility } = req.body;

      // Validate ID
      if (isNaN(meditationId)) {
        throw new AppError(
          ErrorCodes.VALIDATION_ERROR,
          "Invalid meditation ID",
          400,
        );
      }

      // Check if at least one field is provided
      if (
        title === undefined &&
        description === undefined &&
        visibility === undefined
      ) {
        throw new AppError(
          ErrorCodes.VALIDATION_ERROR,
          "At least one field (title, description, or visibility) must be provided",
          400,
        );
      }

      // Validate visibility if provided
      if (visibility !== undefined && visibility !== null) {
        if (visibility !== "public" && visibility !== "private") {
          throw new AppError(
            ErrorCodes.VALIDATION_ERROR,
            "Visibility must be either 'public' or 'private'",
            400,
          );
        }
      }

      // Validate title if provided (not empty)
      if (title !== undefined && title !== null) {
        if (typeof title !== "string" || title.trim() === "") {
          throw new AppError(
            ErrorCodes.VALIDATION_ERROR,
            "Title must be a non-empty string",
            400,
          );
        }
      }

      // Verify ownership via ContractUsersMeditations
      const ownership = await ContractUsersMeditations.findOne({
        where: {
          userId: req.user?.userId,
          meditationId: meditationId,
        },
      });

      if (!ownership) {
        throw new AppError(
          ErrorCodes.UNAUTHORIZED_ACCESS,
          "You do not have permission to update this meditation",
          403,
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

      // Build update object (only include non-null provided fields)
      const updateData: {
        title?: string;
        description?: string;
        visibility?: string;
      } = {};

      if (title !== undefined && title !== null) {
        updateData.title = title.trim();
      }

      if (description !== undefined && description !== null) {
        updateData.description = description;
      }

      if (visibility !== undefined && visibility !== null) {
        updateData.visibility = visibility;
      }

      // Update meditation
      await meditation.update(updateData);

      // Reload to get updated values
      await meditation.reload();

      logger.info(
        `Meditation ${meditationId} updated by user ${req.user?.userId}: ${JSON.stringify(updateData)}`,
      );

      res.status(200).json({
        message: "Meditation updated successfully",
        meditation: meditation.get({ plain: true }),
      });
    } catch (error: any) {
      if (error instanceof AppError) {
        next(error);
      } else {
        logger.error(
          `Failed to update meditation ${req.params.id}: ${error.message}`,
        );
        next(
          new AppError(
            ErrorCodes.INTERNAL_ERROR,
            "Failed to update meditation",
            500,
            error.message,
          ),
        );
      }
    }
  },
);

// DELETE /meditations/:id
router.delete(
  "/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const meditationId = parseInt(req.params.id, 10);

      // Validate ID
      if (isNaN(meditationId)) {
        throw new AppError(
          ErrorCodes.VALIDATION_ERROR,
          "Invalid meditation ID",
          400,
        );
      }

      // Verify ownership via ContractUsersMeditations
      const ownership = await ContractUsersMeditations.findOne({
        where: {
          userId: req.user?.userId,
          meditationId: meditationId,
        },
      });

      if (!ownership) {
        throw new AppError(
          ErrorCodes.UNAUTHORIZED_ACCESS,
          "You do not have permission to delete this meditation",
          403,
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

      // Delete MP3 file if it exists
      if (meditation.filename) {
        const filePath = path.join(
          process.env.PATH_MP3_OUTPUT || "",
          meditation.filename as string,
        );

        if (fs.existsSync(filePath)) {
          try {
            fs.unlinkSync(filePath);
            logger.info(`Deleted meditation file: ${filePath}`);
          } catch (error: any) {
            logger.error(
              `Failed to delete meditation file ${filePath}: ${error.message}`,
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
            `Meditation file not found for deletion: ${filePath}. Proceeding with database deletion.`,
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
        `Meditation ${meditationId} deleted by user ${req.user?.userId}`,
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
          `Failed to delete meditation ${req.params.id}: ${error.message}`,
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

export default router;
