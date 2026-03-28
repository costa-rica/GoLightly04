import {
  User,
  Meditation,
  ContractUsersMeditations,
  ContractUserMeditationsListen,
  ElevenLabsFiles,
  Queue,
  SoundFiles,
  ContractMeditationsElevenLabsFiles,
  ContractMeditationsSoundFiles,
} from "@golightly/db-models";
import { createObjectCsvWriter } from "csv-writer";
import path from "path";
import logger from "../logger";
import { AppError, ErrorCodes } from "../errorHandler";

/**
 * Get all database tables/models
 */
export function getAllTables(): Array<{ name: string; model: any }> {
  return [
    { name: "Users", model: User },
    { name: "Meditations", model: Meditation },
    { name: "ContractUsersMeditations", model: ContractUsersMeditations },
    {
      name: "ContractUserMeditationsListen",
      model: ContractUserMeditationsListen,
    },
    { name: "ElevenLabsFiles", model: ElevenLabsFiles },
    { name: "Queue", model: Queue },
    { name: "SoundFiles", model: SoundFiles },
    {
      name: "ContractMeditationsElevenLabsFiles",
      model: ContractMeditationsElevenLabsFiles,
    },
    {
      name: "ContractMeditationsSoundFiles",
      model: ContractMeditationsSoundFiles,
    },
  ];
}

/**
 * Export a single table to CSV with headers
 */
export async function exportTableToCSV(
  tableName: string,
  model: any,
  outputPath: string,
): Promise<number> {
  logger.info(`Exporting table ${tableName} to ${outputPath}`);

  try {
    // Fetch all records from the table
    const records = await model.findAll();

    // If no records, create empty CSV with headers only
    if (records.length === 0) {
      logger.warn(`Table ${tableName} is empty`);
      // Get column names from model attributes
      const attributes = Object.keys(model.rawAttributes);
      const headers = attributes.map((attr) => ({
        id: attr,
        title: attr,
      }));

      const csvWriter = createObjectCsvWriter({
        path: outputPath,
        header: headers,
      });

      await csvWriter.writeRecords([]);
      return 0;
    }

    // Get plain objects from Sequelize instances
    const plainRecords = records.map((record: any) =>
      record.get({ plain: true }),
    );

    // Get column names from the first record
    const firstRecord = plainRecords[0];
    const headers = Object.keys(firstRecord).map((key) => ({
      id: key,
      title: key,
    }));

    // Create CSV writer
    const csvWriter = createObjectCsvWriter({
      path: outputPath,
      header: headers,
    });

    // Convert null values to empty strings (standard CSV representation)
    const csvRecords = plainRecords.map((record: any) => {
      const csvRecord: any = {};
      for (const [key, value] of Object.entries(record)) {
        csvRecord[key] = value === null ? "" : value;
      }
      return csvRecord;
    });

    // Write records to CSV
    await csvWriter.writeRecords(csvRecords);

    logger.info(`Exported ${csvRecords.length} rows from ${tableName}`);
    return csvRecords.length;
  } catch (error: any) {
    logger.error(`Failed to export table ${tableName}: ${error.message}`);
    throw new AppError(
      ErrorCodes.BACKUP_FAILED,
      `Failed to export table ${tableName}`,
      500,
      error.message,
    );
  }
}

/**
 * Create full database backup
 * Exports all tables to CSV files in the specified directory
 */
export async function createBackup(backupDir: string): Promise<{
  tablesExported: number;
  totalRows: number;
}> {
  logger.info(`Creating backup in ${backupDir}`);

  const tables = getAllTables();
  let totalRows = 0;

  try {
    // Export each table
    for (const { name, model } of tables) {
      const csvPath = path.join(backupDir, `${name}.csv`);
      const rowCount = await exportTableToCSV(name, model, csvPath);
      totalRows += rowCount;
    }

    logger.info(
      `Backup created successfully: ${tables.length} tables, ${totalRows} total rows`,
    );

    return {
      tablesExported: tables.length,
      totalRows,
    };
  } catch (error: any) {
    logger.error(`Failed to create backup: ${error.message}`);
    throw error; // Re-throw to be handled by caller
  }
}
