import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const mockedSafeExtractZip = jest.fn();
const mockedSafeRestoreResources = jest.fn();
const sequelizeQuery = jest.fn();
const sequelizeTransaction = jest.fn(async (callback: (transaction: object) => Promise<unknown>) =>
  callback({ transaction: true }),
);
const usersModel = { bulkCreate: jest.fn() };
const soundFilesModel = { bulkCreate: jest.fn() };
const meditationsModel = { bulkCreate: jest.fn() };
const jobQueueModel = { bulkCreate: jest.fn() };
const contractUserMeditationsModel = { bulkCreate: jest.fn() };

jest.mock("../../src/lib/safeExtractZip", () => ({
  safeExtractZip: (...args: unknown[]) => mockedSafeExtractZip(...args),
}));

jest.mock("../../src/lib/safeRestoreResources", () => ({
  safeRestoreResources: (...args: unknown[]) => mockedSafeRestoreResources(...args),
}));

jest.mock("../../src/lib/db", () => ({
  getDb: () => ({
    sequelize: {
      query: sequelizeQuery,
      transaction: sequelizeTransaction,
    },
    User: usersModel,
    SoundFile: soundFilesModel,
    Meditation: meditationsModel,
    JobQueue: jobQueueModel,
    ContractUserMeditation: contractUserMeditationsModel,
  }),
}));

async function listRestoreTemps() {
  return (await fs.readdir(os.tmpdir())).filter((entry) =>
    entry.startsWith("golightly04_restore_"),
  );
}

describe("replenishService", () => {
  let resourceRoot: string;
  let replenishDir: string;

  beforeEach(async () => {
    jest.clearAllMocks();
    resourceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "golightly-replenish-service-"));
    replenishDir = path.join(resourceRoot, "db_replenish");
    process.env.PATH_PROJECT_RESOURCES = resourceRoot;
    await fs.mkdir(replenishDir, { recursive: true });
    mockedSafeRestoreResources.mockResolvedValue(0);
    sequelizeQuery.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await fs.rm(resourceRoot, { recursive: true, force: true });
  });

  it("imports CSV rows in one transaction, resets sequences, deletes zip, and cleans tempDir", async () => {
    const zipPath = path.join(replenishDir, "restore.zip");
    await fs.writeFile(zipPath, "zip");
    mockedSafeExtractZip.mockImplementationOnce(async (_zipPath: string, tempDir: string) => {
      await fs.writeFile(
        path.join(tempDir, "manifest.json"),
        JSON.stringify({
          created_at: "2026-06-12T00:00:00.000Z",
          app: "GoLightly04",
          package_type: "db_only",
          database_tables: ["jobs_queue"],
        }),
      );
      await fs.writeFile(
        path.join(tempDir, "jobs_queue.csv"),
        [
          "id,meditationId,sequence,type,inputData,status,filePath,attemptCount,lastError,lastAttemptedAt,createdAt,updatedAt",
          "22,5,1,text,{},pending,,0,,,2026-05-17T14:13:33.919Z,2026-05-17T14:13:33.919Z",
        ].join("\n"),
      );
    });
    const beforeTemps = await listRestoreTemps();

    const { isReplenishRunning, replenishDatabase } = await import(
      "../../src/services/replenishService"
    );
    await replenishDatabase("restore.zip");

    expect(isReplenishRunning()).toBe(false);
    expect(sequelizeTransaction).toHaveBeenCalledTimes(1);
    expect(sequelizeQuery).toHaveBeenCalledWith(
      expect.stringContaining("TRUNCATE TABLE"),
      expect.any(Object),
    );
    expect(jobQueueModel.bulkCreate).toHaveBeenCalledWith(
      [expect.objectContaining({ id: "22", inputData: "{}", filePath: null })],
      expect.objectContaining({ validate: false }),
    );
    expect(sequelizeQuery).toHaveBeenCalledWith(
      expect.stringContaining("pg_get_serial_sequence"),
      expect.objectContaining({ bind: ["public.jobs_queue"] }),
    );
    await expect(fs.access(zipPath)).rejects.toThrow();
    expect(await listRestoreTemps()).toEqual(beforeTemps);
  });

  it("restores resources for db_and_resources packages", async () => {
    await fs.writeFile(path.join(replenishDir, "restore.zip"), "zip");
    mockedSafeExtractZip.mockImplementationOnce(async (_zipPath: string, tempDir: string) => {
      await fs.writeFile(
        path.join(tempDir, "manifest.json"),
        JSON.stringify({
          created_at: "2026-06-12T00:00:00.000Z",
          app: "GoLightly04",
          package_type: "db_and_resources",
          database_tables: [],
        }),
      );
    });
    mockedSafeRestoreResources.mockResolvedValueOnce(3);

    const { replenishDatabase } = await import("../../src/services/replenishService");
    await replenishDatabase("restore.zip");

    expect(mockedSafeRestoreResources).toHaveBeenCalledWith(
      expect.stringContaining("golightly04_restore_"),
      resourceRoot,
    );
  });

  it("retains the staged zip on failure while cleaning tempDir and resetting the flag", async () => {
    const zipPath = path.join(replenishDir, "restore.zip");
    await fs.writeFile(zipPath, "zip");
    mockedSafeExtractZip.mockRejectedValueOnce(new Error("extract failed"));
    const beforeTemps = await listRestoreTemps();

    const { isReplenishRunning, replenishDatabase } = await import(
      "../../src/services/replenishService"
    );
    await expect(replenishDatabase("restore.zip")).rejects.toThrow("extract failed");

    expect(isReplenishRunning()).toBe(false);
    await expect(fs.access(zipPath)).resolves.toBeUndefined();
    expect(await listRestoreTemps()).toEqual(beforeTemps);
  });
});
