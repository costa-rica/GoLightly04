import dotenv from "dotenv";

// Load environment variables first
dotenv.config();

// Import logger (this will validate required env vars)
import logger from "./modules/logger";

// Import database
import { initModels } from "@golightly/db-models";

// Import startup checks
import { runStartupChecks } from "./modules/onStartUp";
import { buildApp } from "./app";

// Async IIFE to allow early exit with proper cleanup
(async () => {
  try {
    logger.info("Starting GoLightly02API...");

    // Validate required environment variables
    const requiredVars = [
      "PORT",
      "JWT_SECRET",
      "GOOGLE_CLIENT_ID",
      "PATH_MP3_OUTPUT",
      "PATH_MP3_SOUND_FILES",
      "URL_MANTRIFY01QUEUER",
      "PATH_PROJECT_RESOURCES",
    ];

    const missingVars = requiredVars.filter((varName) => !process.env[varName]);

    if (missingVars.length > 0) {
      logger.error(
        `Missing required environment variables: ${missingVars.join(", ")}`,
      );
      process.stderr.write(
        `[FATAL] Missing required environment variables: ${missingVars.join(", ")}\n`,
      );
      await new Promise((resolve) => setTimeout(resolve, 100));
      process.exit(1);
    }

    // Initialize database and run startup checks
    initModels();
    await runStartupChecks();

    const app = buildApp();

    // Start server
    const PORT = parseInt(process.env.PORT!, 10);
    app.listen(PORT, () => {
      logger.info(`GoLightly03API server running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV}`);
      logger.info(`Health check available at: http://localhost:${PORT}/health`);
    });
  } catch (error: any) {
    logger.error(`Failed to start server: ${error.message}`);
    process.stderr.write(`[FATAL] Failed to start server: ${error.message}\n`);
    await new Promise((resolve) => setTimeout(resolve, 100));
    process.exit(1);
  }
})();
