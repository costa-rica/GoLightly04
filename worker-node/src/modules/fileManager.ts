import * as fs from 'fs';
import * as path from 'path';
import logger from './logger';

/**
 * Ensure a directory exists, create it if it doesn't
 * @param dirPath - Path to the directory
 */
export function ensureDirectoryExists(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    logger.info(`Creating directory: ${dirPath}`);
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Generate unique job filename with timestamp
 * @param userId - User ID for the job
 * @returns Unique job filename
 */
export function generateJobFilename(userId: number): string {
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '_');
  return `job_user${userId}_${timestamp}.csv`;
}

/**
 * Validate that a file exists
 * @param filePath - Path to the file
 * @returns true if file exists, false otherwise
 */
export function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

/**
 * Validate that a file path is valid and accessible
 * @param filePath - Path to the file
 * @throws Error if file doesn't exist or isn't accessible
 */
export function validateFilePath(filePath: string): void {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  try {
    fs.accessSync(filePath, fs.constants.R_OK);
  } catch (error) {
    throw new Error(`File not readable: ${filePath}`);
  }
}

/**
 * Delete a file
 * @param filePath - Path to the file to delete
 */
export function deleteFile(filePath: string): void {
  if (fs.existsSync(filePath)) {
    logger.info(`Deleting file: ${filePath}`);
    fs.unlinkSync(filePath);
  }
}

/**
 * Delete multiple files
 * @param filePaths - Array of file paths to delete
 */
export function deleteFiles(filePaths: string[]): void {
  for (const filePath of filePaths) {
    deleteFile(filePath);
  }
}

/**
 * Get all files in a directory matching a pattern
 * @param dirPath - Path to the directory
 * @param pattern - Regex pattern to match filenames
 * @returns Array of full file paths
 */
export function getFilesInDirectory(dirPath: string, pattern?: RegExp): string[] {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  const files = fs.readdirSync(dirPath);

  const filteredFiles = pattern
    ? files.filter(file => pattern.test(file))
    : files;

  return filteredFiles.map(file => path.join(dirPath, file));
}

/**
 * Copy a file to a new location
 * @param sourcePath - Source file path
 * @param destPath - Destination file path
 */
export function copyFile(sourcePath: string, destPath: string): void {
  logger.info(`Copying file from ${sourcePath} to ${destPath}`);

  // Ensure destination directory exists
  const destDir = path.dirname(destPath);
  ensureDirectoryExists(destDir);

  fs.copyFileSync(sourcePath, destPath);
}
