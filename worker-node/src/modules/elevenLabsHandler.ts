import * as path from "path";
import logger from "./logger";
import {
  MeditationArrayElement,
  ElevenLabsCsvRow,
  ChildProcessResult,
} from "../types";
import { writeElevenLabsCsv, generateCsvFilename } from "./csvWriter";
import { spawnChildProcess, buildChildProcessEnv } from "./childProcessSpawner";

/**
 * Generate ElevenLabs CSV from parsed meditation data
 * @param meditationElements - Array of meditation elements
 * @returns Object with CSV path and row count
 */
export function generateElevenLabsCsv(
  meditationElements: MeditationArrayElement[],
): { csvPath: string; rowCount: number } {
  logger.info("Generating ElevenLabs CSV from meditation data");

  // Filter elements that have text (need to be processed by ElevenLabs)
  const elevenLabsRows: ElevenLabsCsvRow[] = [];

  for (const element of meditationElements) {
    if (element.text && element.text.trim() !== "") {
      elevenLabsRows.push({
        id: element.id,
        text: element.text,
        voice_id: element.voice_id || "", // ElevenLabs will use default if empty
        speed: element.speed || "", // ElevenLabs will use default if empty
      });
    }
  }

  if (elevenLabsRows.length === 0) {
    logger.warn("No text elements found for ElevenLabs processing");
    return { csvPath: "", rowCount: 0 };
  }

  const filename = generateCsvFilename("elevenlabs");
  const csvPath = writeElevenLabsCsv(elevenLabsRows, filename);

  logger.info(
    `Generated ElevenLabs CSV with ${elevenLabsRows.length} rows: ${csvPath}`,
  );

  return { csvPath, rowCount: elevenLabsRows.length };
}

/**
 * Spawn ElevenLabs child process
 * @param csvFilename - Name of the CSV file (without path)
 * @returns Process result with output
 */
export async function spawnElevenLabsProcess(
  csvFilename: string,
): Promise<ChildProcessResult> {
  logger.info(`Spawning ElevenLabs child process with CSV: ${csvFilename}`);

  const elevenLabsServicePath = process.env.PATH_TO_ELEVENLABS_SERVICE;
  if (!elevenLabsServicePath) {
    throw new Error("PATH_TO_ELEVENLABS_SERVICE environment variable not set");
  }

  const childAppName =
    process.env.NAME_CHILD_PROCESS_ELEVENLABS || "RequesterElevenLabs01";

  // Build environment for child process
  const env = buildChildProcessEnv(childAppName);

  // Execute npm start -- --file_name "filename.csv" in the ElevenLabs service directory
  const result = await spawnChildProcess(
    "npm",
    ["start", "--", "--file_name", csvFilename],
    {
      cwd: elevenLabsServicePath,
      env,
    },
  );

  if (!result.success) {
    logger.error(`ElevenLabs process failed: ${result.error?.message}`);
    throw new Error(
      `ElevenLabs process failed with exit code: ${result.exitCode}`,
    );
  }

  logger.info("ElevenLabs process completed successfully");

  return result;
}

/**
 * Parse ElevenLabs output to extract generated file paths
 * @param stdout - Standard output from ElevenLabs process
 * @returns Array of generated MP3 file paths
 */
export function parseElevenLabsOutput(stdout: string): string[] {
  logger.info("Parsing ElevenLabs output for generated file paths");

  const filePaths: string[] = [];
  const lines = stdout.split("\n");

  for (const line of lines) {
    // Look for lines that start with "Audio file created successfully:"
    if (line.includes("Audio file created successfully:")) {
      // Extract the file path (everything after the colon and space)
      const match = line.match(/Audio file created successfully:\s*(.+)/);
      if (match && match[1]) {
        const filePath = match[1].trim();
        filePaths.push(filePath);
        logger.info(`Found generated file: ${filePath}`);
      }
    }
  }

  logger.info(`Parsed ${filePaths.length} file paths from ElevenLabs output`);

  return filePaths;
}

/**
 * Run complete ElevenLabs workflow
 * @param meditationElements - Array of meditation elements
 * @returns Array of generated MP3 file paths
 */
export async function runElevenLabsWorkflow(
  meditationElements: MeditationArrayElement[],
): Promise<string[]> {
  logger.info("Starting ElevenLabs workflow");

  // Generate CSV
  const { csvPath, rowCount } = generateElevenLabsCsv(meditationElements);

  if (rowCount === 0) {
    logger.info("No text elements to process, skipping ElevenLabs");
    return [];
  }

  // Get just the filename for the child process
  const csvFilename = path.basename(csvPath);

  // Spawn child process
  const result = await spawnElevenLabsProcess(csvFilename);

  // Parse output to get generated file paths
  const filePaths = parseElevenLabsOutput(result.stdout);

  if (filePaths.length !== rowCount) {
    logger.warn(
      `Expected ${rowCount} files but got ${filePaths.length} from ElevenLabs output`,
    );
  }

  logger.info(
    `ElevenLabs workflow completed with ${filePaths.length} generated files`,
  );

  return filePaths;
}
