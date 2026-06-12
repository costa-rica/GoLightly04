import { randomUUID } from "node:crypto";
import fsPromises from "node:fs/promises";
import path from "node:path";

import logger from "../config/logger";

const EXCLUDED_RESTORE_DIRS = ["db_backups", "db_backups_and_data", "db_replenish"];

function createTempSiblingPath(destPath: string): string {
  const destDir = path.dirname(destPath);
  const destName = path.basename(destPath);
  return path.join(destDir, `.${destName}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`);
}

export async function safeRestoreResources(
  tempDir: string,
  resourcesRoot: string,
): Promise<number> {
  const srcRoot = path.resolve(tempDir, "resources");
  const destRoot = path.resolve(resourcesRoot);

  let srcDirStat: Awaited<ReturnType<typeof fsPromises.lstat>>;
  try {
    srcDirStat = await fsPromises.lstat(srcRoot);
  } catch {
    return 0;
  }

  if (!srcDirStat.isDirectory()) {
    return 0;
  }

  let restoredCount = 0;

  async function walk(dir: string): Promise<void> {
    const entries = await fsPromises.readdir(dir);
    for (const entry of entries) {
      const fullSrc = path.join(dir, entry);
      const stat = await fsPromises.lstat(fullSrc);

      if (stat.isSymbolicLink()) {
        logger.warn(`safeRestoreResources: skipping symlink ${fullSrc}`);
        continue;
      }

      if (stat.isDirectory()) {
        await walk(fullSrc);
        continue;
      }

      if (!stat.isFile()) {
        logger.warn(`safeRestoreResources: skipping non-regular entry ${fullSrc}`);
        continue;
      }

      const resolvedSrc = path.resolve(fullSrc);
      if (!resolvedSrc.startsWith(srcRoot + path.sep) && resolvedSrc !== srcRoot) {
        logger.warn(
          `safeRestoreResources: source path escapes resources root - skipping ${fullSrc}`,
        );
        continue;
      }

      const relPath = path.relative(srcRoot, resolvedSrc);
      const destPath = path.resolve(destRoot, relPath);
      if (!destPath.startsWith(destRoot + path.sep) && destPath !== destRoot) {
        logger.warn(
          `safeRestoreResources: destination path escapes resources root - skipping ${relPath}`,
        );
        continue;
      }

      const topLevelSegment = relPath.split(path.sep)[0];
      if (EXCLUDED_RESTORE_DIRS.includes(topLevelSegment)) {
        logger.warn(`safeRestoreResources: skipping excluded directory entry ${relPath}`);
        continue;
      }

      await fsPromises.mkdir(path.dirname(destPath), { recursive: true });
      const tempDestPath = createTempSiblingPath(destPath);
      try {
        await fsPromises.copyFile(resolvedSrc, tempDestPath);
        await fsPromises.rename(tempDestPath, destPath);
      } catch (error) {
        let tempCleanupError: unknown = null;
        try {
          await fsPromises.rm(tempDestPath, { force: true });
        } catch (cleanupError) {
          tempCleanupError = cleanupError;
        }
        logger.error("safeRestoreResources: resource copy failed", {
          error,
          sourcePath: resolvedSrc,
          destPath,
          tempDestPath,
          relPath,
          tempCleanupError,
        });
        throw error;
      }
      restoredCount++;
    }
  }

  await walk(srcRoot);
  return restoredCount;
}
