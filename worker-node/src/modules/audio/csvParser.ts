import fs from "fs/promises";
import path from "path";
import { parse } from "csv-parse/sync";

import logger from "../logger";
import { AudioSequenceStep } from "../../types";

export async function parseAudioSequenceCSV(
  csvPath: string,
): Promise<AudioSequenceStep[]> {
  logger.info(`Parsing audio sequence CSV file: ${csvPath}`);

  const resolvedPath = path.resolve(csvPath);

  try {
    await fs.access(resolvedPath);
  } catch {
    throw new Error(`CSV file not found: ${resolvedPath}`);
  }

  const fileContent = await fs.readFile(resolvedPath, "utf-8");
  const records = parse(fileContent, {
    columns: true,
    skip_empty_lines: false,
    trim: true,
  }) as Record<string, unknown>[];

  const results: AudioSequenceStep[] = [];

  for (const row of records) {
    const step: AudioSequenceStep = {
      id: String(row.id ?? "").trim(),
    };

    const audioPath = String(row.audio_file_name_and_path ?? "").trim();
    const pauseValue = String(row.pause_duration ?? "").trim();

    if (audioPath) {
      step.audio_file_name_and_path = audioPath;
    }

    if (pauseValue) {
      const parsedPause = Number(pauseValue);
      if (Number.isFinite(parsedPause)) {
        step.pause_duration = parsedPause;
      } else {
        logger.warn(
          `Invalid pause_duration for step ${step.id}: ${pauseValue}`,
        );
      }
    }

    results.push(step);
  }

  logger.info(`Successfully parsed ${results.length} audio sequence step(s)`);
  return results;
}
