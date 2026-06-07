import fs from "fs";
import fsPromises from "fs/promises";
import os from "os";
import path from "path";
import { Router } from "express";
import type { Transaction } from "sequelize";
import type { ManifestFile } from "@golightly/shared-types";
import { readApiEnv } from "../config/env";
import { logger } from "../config/logger";
import { getDb } from "../lib/db";
import { asyncHandler } from "../lib/asyncHandler";
import { AppError } from "../lib/errors";
import { requireAdmin } from "../middleware/auth";
import { uploadLarge } from "../middleware/upload";
import { parseCsv } from "../lib/csv";
import { getFullBackupsPath } from "../lib/projectPaths";
import { safeExtractZip } from "../lib/safeExtractZip";
import { safeRestoreResources } from "../lib/safeRestoreResources";
import {
  requestWorkerBackup,
  WorkerConflictError,
} from "../services/workerClient";

const TABLE_ORDER = [
  "users",
  "sound_files",
  "meditations",
  "jobs_queue",
  "contract_user_meditations",
] as const;

const DATE_FIELDS = new Set([
  "createdAt",
  "updatedAt",
  "emailVerifiedAt",
  "lastAttemptedAt",
]);

const JSON_FIELDS = new Set(["meditationArray"]);

function getTableModelMap() {
  const { ContractUserMeditation, JobQueue, Meditation, SoundFile, User } = getDb();
  return {
    users: User,
    sound_files: SoundFile,
    meditations: Meditation,
    jobs_queue: JobQueue,
    contract_user_meditations: ContractUserMeditation,
  } as Record<(typeof TABLE_ORDER)[number], any>;
}

function normalizeRestoreRow(row: Record<string, string>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => {
      if (DATE_FIELDS.has(key)) {
        if (!value) {
          return [key, null];
        }
        return [key, value.replace(/^"|"$/g, "")];
      }

      if (JSON_FIELDS.has(key) && value) {
        return [key, JSON.parse(value)];
      }

      if (value === "") {
        return [key, null];
      }

      return [key, value];
    }),
  );
}

async function resetTableIdSequence(tableName: (typeof TABLE_ORDER)[number], transaction: Transaction): Promise<void> {
  await getDb().sequelize.query(
    `SELECT setval(
      pg_get_serial_sequence($1, 'id'),
      COALESCE((SELECT MAX("id") FROM "public"."${tableName}"), 1),
      COALESCE((SELECT MAX("id") FROM "public"."${tableName}"), 0) > 0
    )`,
    {
      bind: [`public.${tableName}`],
      transaction,
    },
  );
}

function isValidManifest(obj: unknown): obj is ManifestFile {
  if (typeof obj !== "object" || obj === null) return false;
  const manifest = obj as Record<string, unknown>;
  return (
    typeof manifest.created_at === "string" &&
    typeof manifest.app === "string" &&
    (manifest.package_type === "db_only" ||
      manifest.package_type === "db_and_resources") &&
    Array.isArray(manifest.database_tables)
  );
}

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
      if (isRoot && (entry === "backups_db" || entry === "backups_db_and_data")) {
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
      const tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "golightly04_restore_"));
      const zipPath = req.file.path;

      try {
        await safeExtractZip(zipPath, tempDir);

        let resourcesRestored = false;
        let resourceFilesRestored = 0;
        try {
          const manifestRaw = await fsPromises.readFile(
            path.join(tempDir, "manifest.json"),
            "utf8",
          );
          const manifest = JSON.parse(manifestRaw) as unknown;
          if (isValidManifest(manifest)) {
            if (manifest.package_type === "db_and_resources") {
              resourceFilesRestored = await safeRestoreResources(
                tempDir,
                readApiEnv().PATH_PROJECT_RESOURCES,
              );
              resourcesRestored = true;
            }
          } else {
            logger.warn("Restore manifest is invalid; continuing with DB-only restore");
          }
        } catch (error) {
          logger.warn("Restore manifest missing or unreadable; continuing with DB-only restore", {
            error,
          });
        }

        const tableModelMap = getTableModelMap();
        let totalRows = 0;
        const rowsImported: Record<string, number> = {};

        const { sequelize } = getDb();
        await sequelize.transaction(async (transaction) => {
          await sequelize.query(
            `TRUNCATE TABLE ${[...TABLE_ORDER]
              .reverse()
              .map((tableName) => `"public"."${tableName}"`)
              .join(", ")} CASCADE`,
            { transaction },
          );

          for (const tableName of TABLE_ORDER) {
            const csvPath = path.join(tempDir, `${tableName}.csv`);
            if (!fs.existsSync(csvPath)) {
              rowsImported[tableName] = 0;
              continue;
            }
            const parsedRows = parseCsv(await fsPromises.readFile(csvPath, "utf8")).map(normalizeRestoreRow);
            rowsImported[tableName] = parsedRows.length;
            totalRows += parsedRows.length;
            if (parsedRows.length > 0) {
              await tableModelMap[tableName].bulkCreate(parsedRows as Array<Record<string, unknown>>, {
                transaction,
                validate: false,
              });
            }
          }

          for (const tableName of TABLE_ORDER) {
            await resetTableIdSequence(tableName, transaction);
          }
        });

        res.json({
          message: "Database replenished",
          tablesImported: TABLE_ORDER.length,
          rowsImported,
          totalRows,
          resourcesRestored,
          resourceFilesRestored,
        });
      } finally {
        await fsPromises.rm(req.file.path, { force: true });
        await fsPromises.rm(tempDir, { recursive: true, force: true });
      }
    }),
  );

  return router;
}
