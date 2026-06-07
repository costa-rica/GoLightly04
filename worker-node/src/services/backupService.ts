import fs from "node:fs";
import fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import archiver from "archiver";

import logger from "../config/logger";
import { loadEnv } from "../config/env";
import { getDb } from "../lib/db";
import { toCsv } from "../lib/csv";
import { getFullBackupsPath } from "../lib/projectPaths";

const TABLE_ORDER = [
  "users",
  "sound_files",
  "meditations",
  "jobs_queue",
  "contract_user_meditations",
] as const;

const EXCLUDED_BACKUP_DIRS = new Set(["backups_db", "backups_db_and_data"]);

let _isBackupRunning = false;

export function isBackupRunning(): boolean {
  return _isBackupRunning;
}

export async function zipDirectory(sourceDir: string, destinationZip: string): Promise<void> {
  await fsPromises.mkdir(path.dirname(destinationZip), { recursive: true });
  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(destinationZip);
    const archive = archiver("zip", { zlib: { level: 9 } });
    output.on("close", () => resolve());
    archive.on("error", reject);
    archive.pipe(output);
    archive.directory(sourceDir, false);
    void archive.finalize();
  });
}

export async function walkResourcesForBackup(
  srcDir: string,
  destDir: string,
  baseDir: string,
): Promise<void> {
  const entries = await fsPromises.readdir(srcDir);

  for (const entry of entries) {
    const src = path.join(srcDir, entry);
    const stat = await fsPromises.lstat(src);

    if (stat.isSymbolicLink()) {
      logger.warn(`Backup resource walk: skipping symlink ${src}`);
      continue;
    }

    if (stat.isDirectory()) {
      await walkResourcesForBackup(src, destDir, baseDir);
      continue;
    }

    if (stat.isFile()) {
      const destination = path.join(destDir, path.relative(baseDir, src));
      await fsPromises.mkdir(path.dirname(destination), { recursive: true });
      await fsPromises.copyFile(src, destination);
      continue;
    }

    logger.warn(`Backup resource walk: skipping non-regular entry ${src}`);
  }
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

function getBackupTimestamp(): string {
  return new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\..+/, "")
    .replace("T", "_");
}

export async function createBackup({
  includeResources,
}: {
  includeResources: boolean;
}): Promise<void> {
  if (_isBackupRunning) {
    throw new Error("A backup job is already running");
  }

  _isBackupRunning = true;
  let tempDir: string | undefined;

  try {
    const env = loadEnv();
    const timestamp = getBackupTimestamp();
    const filename = includeResources
      ? `backup_w_sound_files_${timestamp}.zip`
      : `backup_${timestamp}.zip`;
    tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "golightly04_backup_"));
    const tableModelMap = getTableModelMap();

    logger.info(`Starting backup job includeResources=${includeResources}`);

    for (const tableName of TABLE_ORDER) {
      const model = tableModelMap[tableName];
      const rows = (await model.findAll({
        raw: true,
        order: [["id", "ASC"]],
      })) as Array<Record<string, unknown>>;
      await fsPromises.writeFile(path.join(tempDir, `${tableName}.csv`), toCsv(rows));
    }

    const manifest = {
      created_at: new Date().toISOString(),
      app: "GoLightly04",
      environment: env.NODE_ENV,
      package_type: includeResources ? "db_and_resources" : "db_only",
      database_tables: [...TABLE_ORDER],
      resources_root: env.PATH_PROJECT_RESOURCES,
      excluded_dirs: ["backups_db", "backups_db_and_data"],
    };
    await fsPromises.writeFile(
      path.join(tempDir, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );

    if (includeResources) {
      const resourcesDest = path.join(tempDir, "resources");
      const topLevelEntries = await fsPromises.readdir(env.PATH_PROJECT_RESOURCES);
      for (const entry of topLevelEntries) {
        if (EXCLUDED_BACKUP_DIRS.has(entry)) {
          continue;
        }

        const src = path.join(env.PATH_PROJECT_RESOURCES, entry);
        const stat = await fsPromises.lstat(src);
        if (stat.isSymbolicLink()) {
          logger.warn(`Backup resource walk: skipping top-level symlink ${src}`);
          continue;
        }

        if (stat.isDirectory()) {
          await walkResourcesForBackup(src, resourcesDest, env.PATH_PROJECT_RESOURCES);
          continue;
        }

        if (stat.isFile()) {
          const destination = path.join(resourcesDest, entry);
          await fsPromises.mkdir(path.dirname(destination), { recursive: true });
          await fsPromises.copyFile(src, destination);
          continue;
        }

        logger.warn(`Backup resource walk: skipping top-level non-regular entry ${src}`);
      }
    }

    await fsPromises.mkdir(getFullBackupsPath(), { recursive: true });
    const backupPath = getFullBackupsPath(filename);
    await zipDirectory(tempDir, backupPath);
    logger.info(`Backup job completed: ${backupPath}`);
  } catch (error) {
    logger.error(
      `Backup job failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
    throw error;
  } finally {
    if (tempDir) {
      await fsPromises.rm(tempDir, { recursive: true, force: true });
    }
    _isBackupRunning = false;
  }
}
