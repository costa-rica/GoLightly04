import fs from "fs";
import fsPromises from "fs/promises";
import os from "os";
import path from "path";
import archiver from "archiver";
import unzipper from "unzipper";
import { Router } from "express";
import { getDb } from "../lib/db";
import { asyncHandler } from "../lib/asyncHandler";
import { AppError } from "../lib/errors";
import { requireAdmin } from "../middleware/auth";
import { upload } from "../middleware/upload";
import { parseCsv, toCsv } from "../lib/csv";
import { getBackupsPath } from "../lib/projectPaths";

const TABLE_ORDER = [
  "users",
  "sound_files",
  "meditations",
  "jobs_queue",
  "contract_user_meditations",
] as const;

function getTableModelMap() {
  const { ContractUserMeditation, JobQueue, Meditation, SoundFile, User } = getDb();
  return {
    users: User,
    sound_files: SoundFile,
    meditations: Meditation,
    jobs_queue: JobQueue,
    contract_user_meditations: ContractUserMeditation,
  } as Record<(typeof TABLE_ORDER)[number], any>;
}

async function zipDirectory(sourceDir: string, destinationZip: string): Promise<void> {
  await fsPromises.mkdir(path.dirname(destinationZip), { recursive: true });
  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(destinationZip);
    const archive = archiver("zip", { zlib: { level: 9 } });
    output.on("close", () => resolve());
    archive.on("error", reject);
    archive.pipe(output);
    archive.directory(sourceDir, false);
    void archive.finalize();
  });
}

export function buildDatabaseRouter(): Router {
  const router = Router();
  router.use(requireAdmin);

  router.get(
    "/backups-list",
    asyncHandler(async (_req, res) => {
      await fsPromises.mkdir(getBackupsPath(), { recursive: true });
      const backups = await fsPromises.readdir(getBackupsPath());
      const entries = await Promise.all(
        backups.filter((file) => file.endsWith(".zip")).map(async (filename) => {
          const stat = await fsPromises.stat(getBackupsPath(filename));
          return {
            filename,
            size: stat.size,
            sizeFormatted: `${(stat.size / 1024).toFixed(1)} KB`,
            createdAt: stat.birthtime.toISOString(),
          };
        }),
      );
      res.json({
        backups: entries.sort((a, b) => a.filename.localeCompare(b.filename)),
        count: entries.length,
      });
    }),
  );

  router.post(
    "/create-backup",
    asyncHandler(async (_req, res) => {
      const timestamp = new Date()
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\..+/, "")
        .replace("T", "_");
      const backupDirName = `backup_${timestamp}`;
      const tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), `${backupDirName}_`));
      const tableModelMap = getTableModelMap();

      for (const tableName of TABLE_ORDER) {
        const model = tableModelMap[tableName];
        const rows = (await model.findAll({
          raw: true,
          order: [["id", "ASC"]],
        })) as Array<Record<string, unknown>>;
        await fsPromises.writeFile(path.join(tempDir, `${tableName}.csv`), toCsv(rows));
      }

      const filename = `${backupDirName}.zip`;
      const backupPath = getBackupsPath(filename);
      await zipDirectory(tempDir, backupPath);
      await fsPromises.rm(tempDir, { recursive: true, force: true });

      res.status(201).json({
        message: "Backup created",
        filename,
        path: backupPath,
        tablesExported: TABLE_ORDER.length,
        timestamp,
      });
    }),
  );

  router.get(
    "/download-backup/:filename",
    asyncHandler(async (req, res) => {
      const filePath = getBackupsPath(String(req.params.filename));
      await fsPromises.access(filePath);
      res.download(filePath);
    }),
  );

  router.delete(
    "/delete-backup/:filename",
    asyncHandler(async (req, res) => {
      const filename = String(req.params.filename);
      await fsPromises.rm(getBackupsPath(filename), { force: true });
      res.json({ message: "Backup deleted", filename });
    }),
  );

  router.post(
    "/replenish-database",
    upload.single("file"),
    asyncHandler(async (req, res) => {
      if (!req.file) {
        throw new AppError(400, "VALIDATION_ERROR", "file is required");
      }
      const tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "golightly04_restore_"));
      const zipPath = path.join(tempDir, "restore.zip");
      await fsPromises.writeFile(zipPath, req.file.buffer);
      await fs.createReadStream(zipPath).pipe(unzipper.Extract({ path: tempDir })).promise();

      const tableModelMap = getTableModelMap();
      let totalRows = 0;
      const rowsImported: Record<string, number> = {};

      const { sequelize } = getDb();
      await sequelize.transaction(async (transaction) => {
        for (const tableName of [...TABLE_ORDER].reverse()) {
          await tableModelMap[tableName].destroy({ where: {}, truncate: true, force: true, transaction });
        }

        for (const tableName of TABLE_ORDER) {
          const csvPath = path.join(tempDir, `${tableName}.csv`);
          if (!fs.existsSync(csvPath)) {
            rowsImported[tableName] = 0;
            continue;
          }
          const parsedRows = parseCsv(await fsPromises.readFile(csvPath, "utf8"));
          rowsImported[tableName] = parsedRows.length;
          totalRows += parsedRows.length;
          if (parsedRows.length > 0) {
            await tableModelMap[tableName].bulkCreate(parsedRows as Array<Record<string, unknown>>, {
              transaction,
              validate: false,
            });
          }
        }
      });

      await fsPromises.rm(tempDir, { recursive: true, force: true });

      res.json({
        message: "Database replenished",
        tablesImported: TABLE_ORDER.length,
        rowsImported,
        totalRows,
      });
    }),
  );

  return router;
}
