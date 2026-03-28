import * as fs from "fs";
import * as path from "path";
import { parse } from "csv-parse/sync";
import logger from "./logger";
import { MeditationArrayElement } from "../types";

/**
 * Read and parse CSV file from filenameCsv
 * @param filenameCsv - The name of the CSV file (located in PATH_QUEUER/user_request_csv_files/)
 * @returns Array of MeditationArrayElement objects
 */
export function parseCsvFile(filenameCsv: string): MeditationArrayElement[] {
  const csvFilePath = path.join(
    process.env.PATH_QUEUER || "",
    "user_request_csv_files",
    filenameCsv,
  );

  logger.info(`Reading CSV file: ${csvFilePath}`);

  if (!fs.existsSync(csvFilePath)) {
    throw new Error(`CSV file not found: ${csvFilePath}`);
  }

  const fileContent = fs.readFileSync(csvFilePath, "utf-8");

  const records = parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    cast: false, // Keep all values as strings initially
  });

  logger.info(`Parsed ${records.length} rows from CSV file`);

  // Convert to MeditationArrayElement format
  const meditationElements: MeditationArrayElement[] = records.map(
    (record: any) => ({
      id: record.id,
      text: record.text || undefined,
      voice_id: record.voice_id || undefined,
      speed: record.speed || undefined,
      pause_duration: record.pause_duration || undefined,
      sound_file: record.sound_file || undefined,
    }),
  );

  return meditationElements;
}

/**
 * Validate and normalize meditationArray from request body
 * @param meditationArray - The meditation array from the request body
 * @returns Validated array of MeditationArrayElement objects
 */
export function parseMeditationArray(
  meditationArray: any[],
): MeditationArrayElement[] {
  if (!Array.isArray(meditationArray)) {
    throw new Error("meditationArray must be an array");
  }

  if (meditationArray.length === 0) {
    throw new Error("meditationArray cannot be empty");
  }

  logger.info(
    `Parsing meditationArray with ${meditationArray.length} elements`,
  );

  // Validate and normalize each element
  const normalized: MeditationArrayElement[] = meditationArray.map(
    (element, index) => {
      if (!element.id) {
        throw new Error(
          `meditationArray element at index ${index} is missing 'id' field`,
        );
      }

      return {
        id: element.id,
        text: element.text || undefined,
        voice_id: element.voice_id || undefined,
        speed: element.speed || undefined,
        pause_duration: element.pause_duration || undefined,
        sound_file: element.sound_file || undefined,
      };
    },
  );

  return normalized;
}
