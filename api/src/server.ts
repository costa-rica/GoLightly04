import dotenv from "dotenv";

dotenv.config();

import { logger } from "./config/logger";
import { readApiEnv } from "./config/env";
import { buildApp } from "./app";
import { onStartUp } from "./startup/onStartUp";

(async () => {
  try {
    const env = readApiEnv();
    await onStartUp();
    const app = buildApp();
    app.listen(env.PORT, () => {
      logger.info("API server listening", { port: env.PORT });
    });
  } catch (error) {
    logger.error("API startup failed", { error });
    process.stderr.write("API startup failed\n");
    await new Promise((resolve) => setTimeout(resolve, 100));
    process.exit(1);
  }
})();
