import * as fs from "fs";
import * as path from "path";
import { stringify } from "csv-stringify/sync";
import logger from "./logger";
import { MeditationArrayElement } from "../types";

/**
 * Write job CSV file with meditation array data to PATH_QUEUER/YYYYMMDD/ subdirectory
 * @param jobFilename - The job filename (e.g., job_user1_20260207_012827.csv)
 * @param meditationElements - Array of meditation elements to write
 * @returns Full path to the created CSV file
 */
export function writeJobCsv(
  jobFilename: string,
  meditationElements: MeditationArrayElement[],
): string {
  // Validate PATH_QUEUER environment variable
  if (!process.env.PATH_QUEUER) {
    throw new Error("PATH_QUEUER is not set");
  }

  // Extract date from jobFilename (format: job_user{userId}_{YYYYMMDD}_{HHMMSS}.csv)
  // Example: job_user1_20260207_012827.csv -> 20260207
  const dateMatch = jobFilename.match(/job_user\d+_(\d{8})_\d{6}\.csv/);
  if (!dateMatch) {
    throw new Error(`Invalid job filename format: ${jobFilename}`);
  }
  const dateDir = dateMatch[1]; // YYYYMMDD

  // Construct output path with date subdirectory
  const outputDir = path.join(process.env.PATH_QUEUER, dateDir);
  const outputPath = path.join(outputDir, jobFilename);

  logger.info(
    `Writing job CSV with ${meditationElements.length} elements to: ${outputPath}`,
  );

  // Ensure date subdirectory exists
  if (!fs.existsSync(outputDir)) {
    logger.info(`Creating date subdirectory: ${outputDir}`);
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Convert meditation elements to CSV format
  const csvContent = stringify(meditationElements, {
    header: true,
    columns: [
      "id",
      "text",
      "voice_id",
      "speed",
      "pause_duration",
      "sound_file",
    ],
  });

  // Write to file
  fs.writeFileSync(outputPath, csvContent, "utf-8");

  logger.info(`Job CSV file created successfully: ${outputPath}`);

  return outputPath;
}
