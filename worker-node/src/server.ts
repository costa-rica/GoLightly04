import "dotenv/config";

import logger from "./config/logger";
import { loadEnv } from "./config/env";
import { createApp } from "./app";
import { reconcileStuckMeditations } from "./processor/processMeditation";
import { onStartUp } from "./startup/onStartUp";

async function fatal(error: unknown) {
  logger.error(error instanceof Error ? error.stack ?? error.message : "Unknown fatal error");
  await new Promise((resolve) => setTimeout(resolve, 100));
  process.exit(1);
}

async function start() {
  try {
    const env = loadEnv();
    await onStartUp();
    const app = createApp();
    app.listen(env.PORT, () => {
      logger.info(`${env.NAME_APP} listening on port ${env.PORT}`);
      void reconcileStuckMeditations().catch((error) => {
        logger.error(
          `Startup reconciliation failed: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        );
      });
    });
  } catch (error) {
    await fatal(error);
  }
}

void start();
