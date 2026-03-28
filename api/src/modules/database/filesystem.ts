import path from "path";
import fs from "fs";
import logger from "../logger";

/**
 * Ensure the database_backups directory exists
 * Creates it if it doesn't exist
 */
export function ensureBackupDirectory(): string {
  const backupPath = getBackupPath();

  if (!fs.existsSync(backupPath)) {
    fs.mkdirSync(backupPath, { recursive: true });
    logger.info(`Created backup directory: ${backupPath}`);
  }

  return backupPath;
}

/**
 * Get the full path to the database_backups directory
 */
export function getBackupPath(): string {
  const projectResourcesPath = process.env.PATH_PROJECT_RESOURCES;

  if (!projectResourcesPath) {
    throw new Error("PATH_PROJECT_RESOURCES environment variable is not set");
  }

  return path.join(projectResourcesPath, "database_backups");
}

/**
 * Generate timestamp in YYYYMMDD_HHMMSS format
 */
export function generateTimestamp(): string {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");

  return `${year}${month}${day}_${hours}${minutes}${seconds}`;
}

/**
 * Delete a directory and all its contents
 */
export function cleanupDirectory(dirPath: string): void {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
    logger.info(`Cleaned up directory: ${dirPath}`);
  }
}
