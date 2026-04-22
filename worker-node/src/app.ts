import express from "express";

import logger from "./config/logger";
import { getDb } from "./lib/db";
import {
  isMeditationActive,
  processMeditation,
} from "./processor/processMeditation";

export function createApp() {
  const app = express();
  app.use(express.json());

  app.post("/process", async (req, res, next) => {
    try {
      const meditationId = Number(req.body?.meditationId);
      const mode = req.body?.mode === "requeue" ? "requeue" : "intake";

      if (!Number.isInteger(meditationId)) {
        res.status(400).json({ error: "meditationId must be a number" });
        return;
      }

      logger.info(`POST /process received meditationId=${meditationId} mode=${mode}`);

      if (isMeditationActive(meditationId)) {
        logger.info(`Meditation ${meditationId} is already processing — deduped`);
        res.status(202).json({ accepted: true, deduped: true });
        return;
      }

      const db = getDb();
      const meditation = await db.Meditation.findByPk(meditationId);
      if (!meditation) {
        res.status(404).json({ error: "Meditation not found" });
        return;
      }

      const allowedStatuses =
        mode === "requeue"
          ? ["pending", "processing", "failed"]
          : ["pending", "processing"];

      if (!allowedStatuses.includes(meditation.status)) {
        res.status(409).json({ error: "Meditation is not eligible for processing" });
        return;
      }

      res.status(202).json({ accepted: true });
      logger.info(`Meditation ${meditationId} accepted for processing`);
      void processMeditation(meditationId, mode).catch((error) => {
        logger.error(
          `Background processing failed for meditation ${meditationId}: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        );
      });
    } catch (error) {
      next(error);
    }
  });

  app.use((error: unknown, _req: express.Request, res: express.Response) => {
    logger.error(error instanceof Error ? error.stack ?? error.message : "Unknown error");
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
