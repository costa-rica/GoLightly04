import fs from "node:fs";
import fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { ManifestFile } from "@golightly/shared-types";
import type { Transaction } from "sequelize";

import { loadEnv } from "../config/env";
import logger from "../config/logger";
import { parseCsv } from "../lib/csv";
import { getDb } from "../lib/db";
import { getDbReplenishPath } from "../lib/projectPaths";
import { safeExtractZip } from "../lib/safeExtractZip";
import { safeRestoreResources } from "../lib/safeRestoreResources";

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

let _isReplenishRunning = false;

export function isReplenishRunning(): boolean {
  return _isReplenishRunning;
}

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

async function resetTableIdSequence(
  tableName: (typeof TABLE_ORDER)[number],
  transaction: Transaction,
): Promise<void> {
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

export async function replenishDatabase(filename: string): Promise<void> {
  if (_isReplenishRunning) {
    throw new Error("A replenish job is already running");
  }

  _isReplenishRunning = true;
  const startedAt = Date.now();
  let tempDir: string | undefined;
  const zipPath = getDbReplenishPath(filename);

  try {
    logger.info("Replenish job started", { filename });
    tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "golightly04_restore_"));
    await safeExtractZip(zipPath, tempDir);

    let resourcesRestored = false;
    let resourceFilesRestored = 0;
    let manifest: ManifestFile | null = null;

    try {
      const manifestRaw = await fsPromises.readFile(
        path.join(tempDir, "manifest.json"),
        "utf8",
      );
      const parsedManifest = JSON.parse(manifestRaw) as unknown;
      if (isValidManifest(parsedManifest)) {
        manifest = parsedManifest;
      } else {
        logger.warn("Restore manifest is invalid; continuing with DB-only restore", {
          filename,
        });
      }
    } catch (error) {
      logger.warn("Restore manifest missing or unreadable; continuing with DB-only restore", {
        error,
        filename,
      });
    }

    if (manifest?.package_type === "db_and_resources") {
      resourceFilesRestored = await safeRestoreResources(
        tempDir,
        loadEnv().PATH_PROJECT_RESOURCES,
      );
      resourcesRestored = true;
    }

    const tableModelMap = getTableModelMap();
    const rowsImported: Record<string, number> = {};
    let totalRows = 0;
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
        const csvPath = path.join(tempDir as string, `${tableName}.csv`);
        if (!fs.existsSync(csvPath)) {
          rowsImported[tableName] = 0;
          continue;
        }

        const parsedRows = parseCsv(await fsPromises.readFile(csvPath, "utf8")).map(
          normalizeRestoreRow,
        );
        rowsImported[tableName] = parsedRows.length;
        totalRows += parsedRows.length;
        if (parsedRows.length > 0) {
          await tableModelMap[tableName].bulkCreate(
            parsedRows as Array<Record<string, unknown>>,
            {
              transaction,
              validate: false,
            },
          );
        }
      }

      for (const tableName of TABLE_ORDER) {
        await resetTableIdSequence(tableName, transaction);
      }
    });

    await fsPromises.rm(zipPath, { force: true });
    logger.info("Replenish job completed", {
      filename,
      durationMs: Date.now() - startedAt,
      tablesImported: TABLE_ORDER.length,
      rowsImported,
      totalRows,
      resourcesRestored,
      resourceFilesRestored,
    });
  } catch (error) {
    logger.error("Replenish job failed", {
      error,
      filename,
      durationMs: Date.now() - startedAt,
    });
    throw error;
  } finally {
    if (tempDir) {
      await fsPromises.rm(tempDir, { recursive: true, force: true });
    }
    _isReplenishRunning = false;
  }
}
