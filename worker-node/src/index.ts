import dotenv from "dotenv";

// Load environment variables first
dotenv.config();

// Import logger after dotenv (logger validates env vars)
import logger from "./modules/logger";
import { initializeApp } from "./modules/onStartUp";
import { buildApp } from "./app";

// Start server
async function startServer() {
  try {
    const app = buildApp();
    const port = parseInt(process.env.PORT || "3001", 10);

    // Initialize application (database, admin user, etc.)
    await initializeApp();

    // Start Express server
    app.listen(port, () => {
      logger.info(`${process.env.NAME_APP || "GoLightly03WorkerNode"} running on port ${port}`);
      logger.info(`Environment: ${process.env.NODE_ENV}`);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error(`Failed to start server: ${message}`);
    process.stderr.write(`[FATAL] Failed to start server: ${message}\n`);
    // Implement async IIFE pattern for early exit
    await new Promise((resolve) => setTimeout(resolve, 100));
    process.exit(1);
  }
}

// Initialize server using async IIFE pattern
(async () => {
  await startServer();
})();
