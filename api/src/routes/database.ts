import { randomUUID } from "crypto";
import fsPromises from "fs/promises";
import path from "path";
import { Router } from "express";
import { readApiEnv } from "../config/env";
import { logger } from "../config/logger";
import { asyncHandler } from "../lib/asyncHandler";
import { AppError } from "../lib/errors";
import { requireAdmin } from "../middleware/auth";
import { uploadLarge } from "../middleware/upload";
import { getDbReplenishPath, getFullBackupsPath } from "../lib/projectPaths";
import {
  requestWorkerBackup,
  requestWorkerReplenish,
  WorkerConflictError,
} from "../services/workerClient";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

async function getBackupSizeEstimate(root: string): Promise<number> {
  let total = 0;

  async function walk(dir: string, isRoot = false): Promise<void> {
    const entries = await fsPromises.readdir(dir);
    for (const entry of entries) {
      if (
        isRoot &&
        (entry === "db_backups" ||
          entry === "db_backups_and_data" ||
          entry === "db_replenish")
      ) {
        continue;
      }

      const fullPath = path.join(dir, entry);
      const stat = await fsPromises.lstat(fullPath);
      if (stat.isSymbolicLink()) {
        continue;
      }
      if (stat.isDirectory()) {
        await walk(fullPath);
      } else if (stat.isFile()) {
        total += stat.size;
      }
    }
  }

  await walk(root, true);
  return total;
}

export function buildDatabaseRouter(): Router {
  const router = Router();
  router.use(requireAdmin);

  router.get(
    "/backups-list",
    asyncHandler(async (_req, res) => {
      await fsPromises.mkdir(getFullBackupsPath(), { recursive: true });
      const backups = await fsPromises.readdir(getFullBackupsPath());
      const entries = await Promise.all(
        backups.filter((file) => file.endsWith(".zip")).map(async (filename) => {
          const stat = await fsPromises.stat(getFullBackupsPath(filename));
          return {
            filename,
            size: stat.size,
            sizeFormatted: `${(stat.size / 1024).toFixed(1)} KB`,
            createdAt: stat.birthtime.toISOString(),
          };
        }),
      );
      res.json({
        backups: entries.sort((a, b) => a.filename.localeCompare(b.filename)),
        count: entries.length,
      });
    }),
  );

  router.post(
    "/create-backup",
    asyncHandler(async (req, res) => {
      const includeResources = req.body?.includeResources !== false;

      try {
        await requestWorkerBackup({ includeResources });
        res.status(202).json({
          message: "Backup job queued",
          queuedAt: new Date().toISOString(),
        });
      } catch (error) {
        if (error instanceof WorkerConflictError) {
          res.status(409).json({ error: "A backup job is already running" });
          return;
        }

        logger.warn("Worker unavailable; backup could not be started", { error });
        res.status(503).json({
          error: "Worker unavailable; backup could not be started",
        });
      }
    }),
  );

  router.get(
    "/backup-size-estimate",
    asyncHandler(async (_req, res) => {
      const totalBytes = await getBackupSizeEstimate(readApiEnv().PATH_PROJECT_RESOURCES);
      res.json({
        totalBytes,
        totalBytesFormatted: formatBytes(totalBytes),
      });
    }),
  );

  router.get(
    "/download-backup/:filename",
    asyncHandler(async (req, res) => {
      const filePath = getFullBackupsPath(String(req.params.filename));
      await fsPromises.access(filePath);
      res.download(filePath);
    }),
  );

  router.delete(
    "/delete-backup/:filename",
    asyncHandler(async (req, res) => {
      const filename = String(req.params.filename);
      await fsPromises.rm(getFullBackupsPath(filename), { force: true });
      res.json({ message: "Backup deleted", filename });
    }),
  );

  router.post(
    "/replenish-database",
    uploadLarge.single("file"),
    asyncHandler(async (req, res) => {
      if (!req.file) {
        throw new AppError(400, "VALIDATION_ERROR", "file is required");
      }

      const ts = new Date()
        .toISOString()
        .replace(/[-:.]/g, "")
        .replace("T", "_")
        .replace("Z", "");
      const stagedFilename = `replenish_${ts}_${randomUUID()}.zip`;
      const stagedPath = getDbReplenishPath(stagedFilename);

      await fsPromises.mkdir(path.dirname(stagedPath), { recursive: true });
      try {
        try {
          await fsPromises.rename(req.file.path, stagedPath);
        } catch (error) {
          const nodeError = error as NodeJS.ErrnoException;
          if (nodeError.code !== "EXDEV") {
            throw error;
          }
          await fsPromises.copyFile(req.file.path, stagedPath);
          await fsPromises.rm(req.file.path, { force: true });
        }

        await requestWorkerReplenish({ filename: stagedFilename });
        res.status(202).json({
          message: "Replenish queued",
          queuedAt: new Date().toISOString(),
        });
      } catch (error) {
        await fsPromises.rm(stagedPath, { force: true });
        if (error instanceof WorkerConflictError) {
          res.status(409).json({ error: "A replenish job is already running" });
          return;
        }

        logger.warn("Worker unavailable; replenish could not be started", { error });
        res.status(503).json({
          error: "Worker unavailable; replenish could not be started",
        });
      } finally {
        await fsPromises.rm(req.file.path, { force: true });
      }
    }),
  );

  return router;
}
