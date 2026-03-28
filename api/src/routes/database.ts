import { Router, Request, Response, NextFunction } from "express";
import fs from "fs";
import path from "path";
import multer from "multer";
import { sequelize } from "@golightly/db-models";
import { authMiddleware } from "../modules/authMiddleware";
import { adminMiddleware } from "../modules/adminMiddleware";
import { AppError, ErrorCodes } from "../modules/errorHandler";
import logger from "../modules/logger";
import {
  ensureBackupDirectory,
  generateTimestamp,
  cleanupDirectory,
  getBackupPath,
} from "../modules/database/filesystem";
import { createBackup, getAllTables } from "../modules/database/export";
import { zipDirectory, extractZip } from "../modules/database/compression";
import { importCSVToTable } from "../modules/database/import";
import {
  validateFilename,
  validateZipExtension,
  sanitizeFilename,
} from "../modules/database/validation";

const router = Router();

const requireProjectResources = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (!process.env.PATH_PROJECT_RESOURCES) {
    next(
      new AppError(
        ErrorCodes.INTERNAL_ERROR,
        "PATH_PROJECT_RESOURCES is not configured",
        500,
      ),
    );
    return;
  }

  next();
};

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      try {
        const backupRoot = ensureBackupDirectory();
        const uploadDir = path.join(backupRoot, "uploads");
        fs.mkdirSync(uploadDir, { recursive: true });
        cb(null, uploadDir);
      } catch (error: any) {
        cb(error as Error, "");
      }
    },
    filename: (req, file, cb) => {
      const sanitized = sanitizeFilename(file.originalname);
      const uniqueSuffix = `${generateTimestamp()}_${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      cb(null, `restore_${uniqueSuffix}_${sanitized}`);
    },
  }),
  fileFilter: (req, file, cb) => {
    if (!file.originalname.endsWith(".zip")) {
      cb(
        new AppError(
          ErrorCodes.INVALID_BACKUP_FILE,
          "Only .zip files are allowed",
          400,
        ),
      );
      return;
    }

    cb(null, true);
  },
});

// Apply authentication and admin middleware to all routes
router.use(authMiddleware);
router.use(adminMiddleware);

// POST /database/create-backup - Create database backup
router.post(
  "/create-backup",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      logger.info(
        `Admin user ${req.user?.userId} initiated database backup creation`,
      );

      const projectResourcesPath = process.env.PATH_PROJECT_RESOURCES;
      if (!projectResourcesPath) {
        throw new AppError(
          ErrorCodes.BACKUP_FAILED,
          "PATH_PROJECT_RESOURCES is not configured",
          500,
        );
      }

      const backupRoot = ensureBackupDirectory();
      const timestamp = generateTimestamp();
      const backupFolderName = `database_backup_${timestamp}`;
      const backupFolderPath = path.join(backupRoot, backupFolderName);
      const zipFilename = `${backupFolderName}.zip`;
      const zipPath = path.join(backupRoot, zipFilename);

      const cleanupNonZipFiles = () => {
        if (!fs.existsSync(backupRoot)) {
          return;
        }

        const entries = fs.readdirSync(backupRoot);
        for (const entry of entries) {
          if (entry.endsWith(".zip")) {
            continue;
          }

          const entryPath = path.join(backupRoot, entry);
          try {
            const stats = fs.statSync(entryPath);
            if (stats.isDirectory()) {
              fs.rmSync(entryPath, { recursive: true, force: true });
            } else {
              fs.unlinkSync(entryPath);
            }
          } catch (cleanupError: any) {
            logger.warn(
              `Failed to cleanup non-zip backup entry ${entryPath}: ${cleanupError.message}`,
            );
          }
        }
      };

      let tablesExported = 0;

      try {
        const tables = getAllTables();
        if (tables.length === 0) {
          throw new AppError(
            ErrorCodes.BACKUP_FAILED,
            "No tables found to export",
            500,
          );
        }

        fs.mkdirSync(backupFolderPath, { recursive: true });

        const backupResult = await createBackup(backupFolderPath);
        tablesExported = backupResult.tablesExported;

        await zipDirectory(backupFolderPath, zipPath);

        cleanupDirectory(backupFolderPath);
      } catch (error: any) {
        cleanupDirectory(backupFolderPath);

        if (fs.existsSync(zipPath)) {
          try {
            fs.unlinkSync(zipPath);
          } catch (cleanupError: any) {
            logger.warn(
              `Failed to remove partial zip file ${zipPath}: ${cleanupError.message}`,
            );
          }
        }

        cleanupNonZipFiles();
        throw error;
      }

      logger.info(
        `Database backup created: ${zipFilename} (${tablesExported} tables)`,
      );

      res.status(200).json({
        message: "Database backup created successfully",
        filename: zipFilename,
        path: zipPath,
        tablesExported,
        timestamp,
      });
    } catch (error: any) {
      if (error instanceof AppError) {
        next(error);
      } else {
        logger.error(`Failed to create backup: ${error.message}`);
        next(
          new AppError(
            ErrorCodes.BACKUP_FAILED,
            "Failed to create database backup",
            500,
            error.message,
          ),
        );
      }
    }
  },
);

// GET /database/backups-list - List all backup files
router.get(
  "/backups-list",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      logger.info(`Admin user ${req.user?.userId} requested backup list`);

      const projectResourcesPath = process.env.PATH_PROJECT_RESOURCES;
      if (!projectResourcesPath) {
        throw new AppError(
          ErrorCodes.INTERNAL_ERROR,
          "PATH_PROJECT_RESOURCES is not configured",
          500,
        );
      }

      const backupPath = getBackupPath();

      if (!fs.existsSync(backupPath)) {
        res.status(200).json({
          backups: [],
          count: 0,
        });
        return;
      }

      const formatSize = (bytes: number): string => {
        if (bytes < 1024) {
          return `${bytes} B`;
        }

        const units = ["KB", "MB", "GB", "TB"];
        let size = bytes / 1024;
        let unitIndex = 0;

        while (size >= 1024 && unitIndex < units.length - 1) {
          size /= 1024;
          unitIndex += 1;
        }

        return `${size.toFixed(2)} ${units[unitIndex]}`;
      };

      const entries = await fs.promises.readdir(backupPath);
      const backupFiles = entries.filter((entry) => entry.endsWith(".zip"));

      const backups = await Promise.all(
        backupFiles.map(async (filename) => {
          const fullPath = path.join(backupPath, filename);
          const stats = await fs.promises.stat(fullPath);

          if (!stats.isFile()) {
            return null;
          }

          return {
            filename,
            size: stats.size,
            sizeFormatted: formatSize(stats.size),
            createdAt: stats.birthtime.toISOString(),
          };
        }),
      );

      const filteredBackups = backups
        .filter(
          (backup): backup is NonNullable<typeof backup> => backup !== null,
        )
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );

      res.status(200).json({
        backups: filteredBackups,
        count: filteredBackups.length,
      });
    } catch (error: any) {
      if (error instanceof AppError) {
        next(error);
      } else {
        logger.error(`Failed to list backups: ${error.message}`);
        next(
          new AppError(
            ErrorCodes.INTERNAL_ERROR,
            "Failed to list backups",
            500,
            error.message,
          ),
        );
      }
    }
  },
);

// GET /database/download-backup/:filename - Download backup file
router.get(
  "/download-backup/:filename",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { filename } = req.params;
      logger.info(
        `Admin user ${req.user?.userId} requested backup download: ${filename}`,
      );

      validateZipExtension(filename);
      validateFilename(filename);

      const projectResourcesPath = process.env.PATH_PROJECT_RESOURCES;
      if (!projectResourcesPath) {
        throw new AppError(
          ErrorCodes.INTERNAL_ERROR,
          "PATH_PROJECT_RESOURCES is not configured",
          500,
        );
      }

      const sanitizedFilename = sanitizeFilename(filename);
      const backupPath = getBackupPath();
      const filePath = path.join(backupPath, sanitizedFilename);

      if (!fs.existsSync(filePath)) {
        throw new AppError(
          ErrorCodes.BACKUP_NOT_FOUND,
          "Backup file not found",
          404,
        );
      }

      const fileStats = fs.statSync(filePath);
      if (!fileStats.isFile()) {
        throw new AppError(
          ErrorCodes.BACKUP_NOT_FOUND,
          "Backup file not found",
          404,
        );
      }

      res.setHeader("Content-Type", "application/zip");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${sanitizedFilename}"`,
      );
      res.setHeader("Content-Length", fileStats.size.toString());

      const readStream = fs.createReadStream(filePath);
      readStream.on("error", (error) => {
        logger.error(
          `Failed to stream backup file ${sanitizedFilename}: ${error.message}`,
        );
        next(
          new AppError(
            ErrorCodes.BACKUP_NOT_FOUND,
            "Failed to download backup",
            500,
            error.message,
          ),
        );
      });

      readStream.pipe(res);
      logger.info(
        `Backup downloaded by admin ${req.user?.userId}: ${sanitizedFilename}`,
      );
    } catch (error: any) {
      if (error instanceof AppError) {
        next(error);
      } else {
        logger.error(`Failed to download backup: ${error.message}`);
        next(
          new AppError(
            ErrorCodes.BACKUP_NOT_FOUND,
            "Failed to download backup",
            500,
            error.message,
          ),
        );
      }
    }
  },
);

// DELETE /database/delete-backup/:filename - Delete backup file
router.delete(
  "/delete-backup/:filename",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { filename } = req.params;
      logger.info(
        `Admin user ${req.user?.userId} requested backup deletion: ${filename}`,
      );

      validateZipExtension(filename);
      validateFilename(filename);

      const projectResourcesPath = process.env.PATH_PROJECT_RESOURCES;
      if (!projectResourcesPath) {
        throw new AppError(
          ErrorCodes.INTERNAL_ERROR,
          "PATH_PROJECT_RESOURCES is not configured",
          500,
        );
      }

      const sanitizedFilename = sanitizeFilename(filename);
      const backupPath = getBackupPath();
      const filePath = path.join(backupPath, sanitizedFilename);

      if (!fs.existsSync(filePath)) {
        throw new AppError(
          ErrorCodes.BACKUP_NOT_FOUND,
          "Backup file not found",
          404,
        );
      }

      const fileStats = fs.statSync(filePath);
      if (!fileStats.isFile()) {
        throw new AppError(
          ErrorCodes.BACKUP_NOT_FOUND,
          "Backup file not found",
          404,
        );
      }

      try {
        await fs.promises.unlink(filePath);
      } catch (error: any) {
        logger.error(
          `Failed to delete backup file ${sanitizedFilename}: ${error.message}`,
        );
        throw new AppError(
          ErrorCodes.BACKUP_FAILED,
          "Failed to delete backup",
          500,
          error.message,
        );
      }

      logger.info(
        `Backup deleted by admin ${req.user?.userId}: ${sanitizedFilename}`,
      );

      res.status(200).json({
        message: "Backup deleted successfully",
        filename: sanitizedFilename,
      });
    } catch (error: any) {
      if (error instanceof AppError) {
        next(error);
      } else {
        logger.error(`Failed to delete backup: ${error.message}`);
        next(
          new AppError(
            ErrorCodes.BACKUP_NOT_FOUND,
            "Failed to delete backup",
            500,
            error.message,
          ),
        );
      }
    }
  },
);

// POST /database/replenish-database - Restore database from backup
router.post(
  "/replenish-database",
  requireProjectResources,
  upload.single("file"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      logger.info(
        `Admin user ${req.user?.userId} initiated database restoration`,
      );

      if (!req.file) {
        throw new AppError(
          ErrorCodes.INVALID_BACKUP_FILE,
          "No backup file uploaded",
          400,
        );
      }

      validateZipExtension(req.file.originalname);

      const backupRoot = ensureBackupDirectory();
      const uploadedFilePath = req.file.path;
      const rowsImported: Record<string, number> = {};
      let totalRows = 0;
      let transaction = null;
      let extractionDir: string | null = null;

      try {
        extractionDir = await fs.promises.mkdtemp(
          path.join(backupRoot, "restore_"),
        );

        await extractZip(uploadedFilePath, extractionDir);

        const findCsvRoot = async (
          rootPath: string,
        ): Promise<string | null> => {
          const entries = await fs.promises.readdir(rootPath, {
            withFileTypes: true,
          });

          const csvInRoot = entries
            .filter((entry) => entry.isFile() && entry.name.endsWith(".csv"))
            .map((entry) => entry.name);

          if (csvInRoot.length > 0) {
            return rootPath;
          }

          const subdirs = entries
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name);

          for (const subdir of subdirs) {
            const candidate = path.join(rootPath, subdir);
            const nestedEntries = await fs.promises.readdir(candidate, {
              withFileTypes: true,
            });
            const csvInSubdir = nestedEntries
              .filter((entry) => entry.isFile() && entry.name.endsWith(".csv"))
              .map((entry) => entry.name);
            if (csvInSubdir.length > 0) {
              return candidate;
            }
          }

          return null;
        };

        const csvRoot = await findCsvRoot(extractionDir);
        if (!csvRoot) {
          throw new AppError(
            ErrorCodes.INVALID_BACKUP_FILE,
            "No CSV files found in backup",
            400,
          );
        }

        const csvFiles = (await fs.promises.readdir(csvRoot)).filter((entry) =>
          entry.endsWith(".csv"),
        );

        if (csvFiles.length === 0) {
          throw new AppError(
            ErrorCodes.INVALID_BACKUP_FILE,
            "No CSV files found in backup",
            400,
          );
        }

        const tables = getAllTables();

        transaction = await sequelize.transaction();

        // Clear all existing data before restore (in reverse order to handle foreign keys)
        logger.info("Clearing existing database data before restore");
        for (let i = tables.length - 1; i >= 0; i--) {
          const { name, model } = tables[i];
          await model.destroy({
            where: {},
            truncate: true,
            cascade: true,
            transaction,
          });
          logger.info(`Cleared table: ${name}`);
        }

        // Import tables in correct dependency order (forward order)
        for (const { name, model } of tables) {
          const csvPath = path.join(csvRoot, `${name}.csv`);

          // Skip if CSV file doesn't exist for this table
          if (!fs.existsSync(csvPath)) {
            logger.warn(`CSV file not found for table ${name}, skipping`);
            rowsImported[name] = 0;
            continue;
          }

          const rowCount = await importCSVToTable(
            csvPath,
            name,
            model,
            transaction,
          );
          rowsImported[name] = rowCount;
          totalRows += rowCount;
        }

        await transaction.commit();
        transaction = null;
      } catch (error: any) {
        if (transaction) {
          await transaction.rollback();
        }
        throw error;
      } finally {
        // Skip cleanup in development mode to allow manual inspection of files
        const isDevelopment = process.env.NODE_ENV === "development";

        if (extractionDir) {
          if (isDevelopment) {
            logger.info(
              `Development mode: preserving extraction directory at ${extractionDir}`,
            );
          } else {
            cleanupDirectory(extractionDir);
          }
        }

        if (fs.existsSync(uploadedFilePath)) {
          if (isDevelopment) {
            logger.info(
              `Development mode: preserving uploaded file at ${uploadedFilePath}`,
            );
          } else {
            try {
              await fs.promises.unlink(uploadedFilePath);
            } catch (cleanupError: any) {
              logger.warn(
                `Failed to remove uploaded backup file ${uploadedFilePath}: ${cleanupError.message}`,
              );
            }
          }
        }
      }

      const tablesImported = Object.keys(rowsImported).length;

      logger.info(
        `Database restored successfully: ${tablesImported} tables, ${totalRows} total rows`,
      );

      res.status(200).json({
        message: "Database restored successfully",
        tablesImported,
        rowsImported,
        totalRows,
      });
    } catch (error: any) {
      if (error instanceof AppError) {
        next(error);
      } else {
        logger.error(`Failed to restore database: ${error.message}`);
        next(
          new AppError(
            ErrorCodes.RESTORE_FAILED,
            "Failed to restore database",
            500,
            error.message,
          ),
        );
      }
    }
  },
);

export default router;
