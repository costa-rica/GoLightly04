import fs from "fs/promises";
import path from "path";
import { parse } from "csv-parse/sync";

import { ElevenLabsBatchRow } from "../../types";
import logger from "../logger";

export async function parseCSVFile(
  fileName: string,
  csvDirectory: string,
): Promise<ElevenLabsBatchRow[]> {
  try {
    const filePath = path.join(csvDirectory, fileName);
    logger.info(`Reading ElevenLabs CSV file: ${filePath}`);

    try {
      await fs.access(filePath);
    } catch {
      throw new Error(`CSV file not found: ${filePath}`);
    }

    const fileContent = await fs.readFile(filePath, "utf-8");
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: false,
      trim: true,
    }) as Record<string, unknown>[];

    if (records.length === 0) {
      throw new Error("CSV file contains no data rows");
    }

    const validRows: ElevenLabsBatchRow[] = [];

    for (let i = 0; i < records.length; i += 1) {
      const row = records[i];
      const cleanRow: Record<string, string> = {};

      for (const key of Object.keys(row)) {
        cleanRow[key.trim()] = String(row[key] ?? "").trim();
      }

      const id = cleanRow.id || "";
      const text = cleanRow.text || "";

      if (id === "" || text === "") {
        if (i === 0) {
          throw new Error(
            `First row in CSV is empty or missing required fields. Row data: ${JSON.stringify(cleanRow)}`,
          );
        }

        logger.info(`Encountered empty row at position ${i + 1}. Stopping processing.`);
        break;
      }

      validRows.push({
        id,
        text,
        voice_id: cleanRow.voice_id || undefined,
        speed: cleanRow.speed || undefined,
      });
    }

    if (validRows.length === 0) {
      throw new Error("No valid rows found in CSV file");
    }

    logger.info(`Parsed ${validRows.length} valid ElevenLabs CSV rows`);
    return validRows;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error(`Error parsing ElevenLabs CSV file: ${errorMessage}`);
    throw error;
  }
}
