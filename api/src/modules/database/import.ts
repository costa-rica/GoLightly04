import fs from "fs";
import path from "path";
import csv from "csv-parser";
import { sequelize } from "@golightly/db-models";
import { Transaction } from "sequelize";
import { getAllTables } from "./export";
import logger from "../logger";
import { AppError, ErrorCodes } from "../errorHandler";

/**
 * Check if a row is completely empty (all values are null or empty strings)
 */
function isEmptyRow(row: any): boolean {
  return Object.values(row).every((value) => value === "" || value === null);
}

/**
 * Parse CSV row with NULL handling
 * Converts empty strings back to null values
 */
export function parseCSVRow(row: any): any {
  const parsedRow: any = {};

  for (const [key, value] of Object.entries(row)) {
    // Convert empty strings back to null (standard CSV convention)
    parsedRow[key] = value === "" ? null : value;
  }

  return parsedRow;
}

/**
 * Import a single CSV file to a database table
 */
export async function importCSVToTable(
  csvPath: string,
  tableName: string,
  model: any,
  transaction?: Transaction,
): Promise<number> {
  logger.info(`Importing ${csvPath} to table ${tableName}`);

  return new Promise((resolve, reject) => {
    const rows: any[] = [];

    fs.createReadStream(csvPath)
      .pipe(csv())
      .on("data", (row) => {
        // Skip completely empty rows (happens when CSV has trailing newlines)
        if (isEmptyRow(row)) {
          return;
        }

        // Parse row and handle NULL values
        const parsedRow = parseCSVRow(row);
        rows.push(parsedRow);
      })
      .on("end", async () => {
        try {
          if (rows.length === 0) {
            logger.warn(`No data to import for table ${tableName}`);
            resolve(0);
            return;
          }

          // Bulk insert all rows
          await model.bulkCreate(rows, {
            validate: true,
            individualHooks: false,
            transaction,
          });

          logger.info(`Imported ${rows.length} rows into ${tableName}`);
          resolve(rows.length);
        } catch (error: any) {
          // Log detailed error information for debugging
          const errorMessage =
            error.message || error.toString() || "Unknown error";
          const errorDetails = error.errors
            ? JSON.stringify(error.errors, null, 2)
            : "";

          logger.error(`Failed to import CSV to ${tableName}: ${errorMessage}`);
          if (errorDetails) {
            logger.error(`Validation errors: ${errorDetails}`);
          }

          reject(
            new AppError(
              ErrorCodes.RESTORE_FAILED,
              `Failed to import data to ${tableName}`,
              500,
              errorMessage,
            ),
          );
        }
      })
      .on("error", (error) => {
        logger.error(`Failed to read CSV file ${csvPath}: ${error.message}`);
        reject(
          new AppError(
            ErrorCodes.INVALID_BACKUP_FILE,
            `Failed to read CSV file for ${tableName}`,
            500,
            error.message,
          ),
        );
      });
  });
}

/**
 * Restore database from backup directory
 * Imports all CSV files found in the directory
 */
export async function restoreFromBackup(
  extractedPath: string,
): Promise<{ [tableName: string]: number }> {
  logger.info(`Restoring database from ${extractedPath}`);

  const tables = getAllTables();
  const importResults: { [tableName: string]: number } = {};

  // Use transaction to ensure atomicity
  const transaction = await sequelize.transaction();

  try {
    // Import each table in order
    for (const { name, model } of tables) {
      const csvPath = path.join(extractedPath, `${name}.csv`);

      // Check if CSV file exists
      if (!fs.existsSync(csvPath)) {
        logger.warn(`CSV file not found for table ${name}: ${csvPath}`);
        importResults[name] = 0;
        continue;
      }

      // Verify table exists in database
      if (!model) {
        throw new AppError(
          ErrorCodes.RESTORE_FAILED,
          `Table ${name} does not exist in database`,
          400,
        );
      }

      // Import the CSV
      const rowCount = await importCSVToTable(
        csvPath,
        name,
        model,
        transaction,
      );
      importResults[name] = rowCount;
    }

    // Commit transaction
    await transaction.commit();

    const totalRows = Object.values(importResults).reduce(
      (sum, count) => sum + count,
      0,
    );
    logger.info(
      `Database restored successfully: ${Object.keys(importResults).length} tables, ${totalRows} total rows`,
    );

    return importResults;
  } catch (error: any) {
    // Rollback transaction on error
    await transaction.rollback();
    logger.error(`Failed to restore database: ${error.message}`);
    throw error; // Re-throw to be handled by caller
  }
}
