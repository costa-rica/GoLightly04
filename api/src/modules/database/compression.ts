import archiver from "archiver";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import { pipeline } from "stream";
import { createReadStream, createWriteStream } from "fs";
import logger from "../logger";
import { AppError, ErrorCodes } from "../errorHandler";

const pipelineAsync = promisify(pipeline);

/**
 * Zip a directory using archiver
 */
export async function zipDirectory(
  sourceDir: string,
  outPath: string,
): Promise<void> {
  logger.info(`Zipping ${sourceDir} to ${outPath}`);

  return new Promise((resolve, reject) => {
    // Create output stream
    const output = createWriteStream(outPath);
    const archive = archiver("zip", {
      zlib: { level: 9 }, // Maximum compression
    });

    // Listen for completion
    output.on("close", () => {
      logger.info(
        `Zip file created: ${outPath} (${archive.pointer()} total bytes)`,
      );
      resolve();
    });

    // Listen for warnings
    archive.on("warning", (err) => {
      if (err.code === "ENOENT") {
        logger.warn(`Archive warning: ${err.message}`);
      } else {
        reject(err);
      }
    });

    // Listen for errors
    archive.on("error", (err) => {
      logger.error(`Archive error: ${err.message}`);
      reject(err);
    });

    // Pipe archive data to the file
    archive.pipe(output);

    // Append files from the source directory
    archive.directory(sourceDir, false);

    // Finalize the archive
    archive.finalize();
  });
}

/**
 * Extract a zip file
 */
export async function extractZip(
  zipPath: string,
  extractPath: string,
): Promise<void> {
  logger.info(`Extracting ${zipPath} to ${extractPath}`);

  // Use unzipper package for extraction
  const unzipper = await import("unzipper");

  // Ensure extract directory exists
  if (!fs.existsSync(extractPath)) {
    fs.mkdirSync(extractPath, { recursive: true });
  }

  return new Promise((resolve, reject) => {
    createReadStream(zipPath)
      .pipe(unzipper.Extract({ path: extractPath }))
      .on("close", () => {
        logger.info(`Successfully extracted ${zipPath} to ${extractPath}`);
        resolve();
      })
      .on("error", (err: Error) => {
        logger.error(`Failed to extract zip: ${err.message}`);
        reject(
          new AppError(
            ErrorCodes.INVALID_BACKUP_FILE,
            "Failed to extract zip file",
            500,
            err.message,
          ),
        );
      });
  });
}
