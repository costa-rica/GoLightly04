import { Router, Request, Response, NextFunction } from "express";
import logger from "../modules/logger";
import { validateMeditationRequest } from "../modules/validator";
import { orchestrateMeditationCreation } from "../modules/workflowOrchestrator";
import { MeditationRequestBody } from "../types";

const router = Router();

/**
 * POST /meditations/new
 * Create a new meditation from CSV file or array
 */
router.post("/new", async (req: Request, res: Response, next: NextFunction) => {
  try {
    logger.info("Received POST /meditations/new request");

    // Log complete request body in development mode
    if (process.env.NODE_ENV === "development") {
      logger.debug(`Request body: ${JSON.stringify(req.body, null, 2)}`);
    }

    // Validate request body
    validateMeditationRequest(req.body);

    const requestBody: MeditationRequestBody = req.body;

    // Log request details
    logger.info(`Processing meditation request for user ${requestBody.userId}`);
    if (requestBody.filenameCsv) {
      logger.info(`Using CSV file: ${requestBody.filenameCsv}`);
    } else if (requestBody.meditationArray) {
      logger.info(
        `Using meditationArray with ${requestBody.meditationArray.length} elements`,
      );
    }

    // Orchestrate meditation creation workflow
    const result = await orchestrateMeditationCreation(requestBody);

    if (result.success) {
      logger.info(`Meditation creation successful: ${result.finalFilePath}`);

      res.status(200).json({
        success: true,
        queueId: result.queueId,
        finalFilePath: result.finalFilePath,
        message: "Meditation created successfully",
      });
    } else {
      logger.error(`Meditation creation failed: ${result.error}`);

      res.status(500).json({
        success: false,
        queueId: result.queueId,
        error: {
          code: "WORKFLOW_FAILED",
          message: result.error || "Meditation creation failed",
          status: 500,
        },
      });
    }
  } catch (error) {
    // Pass error to error handler middleware
    next(error);
  }
});

export default router;
