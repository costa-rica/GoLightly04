import fs from "node:fs";
import path from "node:path";

import express from "express";

import logger from "./config/logger";
import { getDb } from "./lib/db";
import { getDbReplenishPath } from "./lib/projectPaths";
import {
  isAnyMeditationActive,
  isMeditationActive,
  processMeditation,
} from "./processor/processMeditation";
import { createBackup, isBackupRunning } from "./services/backupService";
import {
  isReplenishRunning,
  replenishDatabase,
} from "./services/replenishService";

export function createApp() {
  const app = express();
  app.use(express.json());

  app.post("/process", async (req, res, next) => {
    try {
      if (isReplenishRunning()) {
        res.status(409).json({ error: "A replenish job is running; processing cannot start" });
        return;
      }

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

  app.post("/backup", async (req, res, next) => {
    try {
      const includeResources = req.body?.includeResources !== false;

      if (isReplenishRunning()) {
        res.status(409).json({ error: "A replenish job is running; backup cannot start" });
        return;
      }

      if (isBackupRunning()) {
        res.status(409).json({ error: "A backup job is already running" });
        return;
      }

      res.status(202).json({ accepted: true });

      void createBackup({ includeResources }).catch((error) => {
        logger.error(
          `Background backup failed: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        );
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/replenish", async (req, res, next) => {
    try {
      if (isReplenishRunning()) {
        res.status(409).json({ error: "A replenish job is already running" });
        return;
      }

      if (isBackupRunning()) {
        res.status(409).json({ error: "A backup job is running; replenish cannot start" });
        return;
      }

      if (isAnyMeditationActive()) {
        res.status(409).json({ error: "Active meditation processing; replenish cannot start" });
        return;
      }

      const filename = req.body?.filename;
      if (
        typeof filename !== "string" ||
        filename.includes("/") ||
        filename.includes("..") ||
        !filename.endsWith(".zip")
      ) {
        res.status(400).json({ error: "filename must be a .zip basename" });
        return;
      }

      const root = path.resolve(getDbReplenishPath());
      const resolvedPath = path.resolve(getDbReplenishPath(filename));
      if (!resolvedPath.startsWith(root + path.sep) || !fs.existsSync(resolvedPath)) {
        res.status(404).json({ error: "Replenish file not found" });
        return;
      }

      res.status(202).json({ accepted: true });

      void replenishDatabase(filename).catch((error) => {
        logger.error("Background replenish failed", {
          error,
          filename,
        });
      });
    } catch (error) {
      next(error);
    }
  });

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error(error instanceof Error ? error.stack ?? error.message : "Unknown error");
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
