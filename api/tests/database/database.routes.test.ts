import fs from "fs/promises";
import os from "os";
import path from "path";
import archiver from "archiver";
import request from "supertest";
import { buildApp } from "../../src/app";
import { issueAccessToken } from "../../src/lib/authTokens";

const usersModel = {
  findAll: jest.fn(),
  destroy: jest.fn(),
  bulkCreate: jest.fn(),
};
const soundFilesModel = {
  findAll: jest.fn(),
  destroy: jest.fn(),
  bulkCreate: jest.fn(),
};
const meditationsModel = {
  findAll: jest.fn(),
  destroy: jest.fn(),
  bulkCreate: jest.fn(),
};
const jobQueueModel = {
  findAll: jest.fn(),
  destroy: jest.fn(),
  bulkCreate: jest.fn(),
};
const contractUserMeditationsModel = {
  findAll: jest.fn(),
  destroy: jest.fn(),
  bulkCreate: jest.fn(),
};

const sequelizeMock = {
  query: jest.fn(),
  transaction: jest.fn(async (callback: (transaction: object) => Promise<unknown>) => callback({})),
};

async function createRestoreZip(files: Record<string, string>): Promise<Buffer> {
  const archive = archiver("zip", { zlib: { level: 9 } });
  const chunks: Buffer[] = [];

  archive.on("data", (chunk: Buffer) => chunks.push(chunk));

  const finished = new Promise<Buffer>((resolve, reject) => {
    archive.on("end", () => resolve(Buffer.concat(chunks)));
    archive.on("error", reject);
  });

  for (const [filename, content] of Object.entries(files)) {
    archive.append(content, { name: filename });
  }

  await archive.finalize();
  return finished;
}

jest.mock("../../src/lib/db", () => ({
  getDb: () => ({
    sequelize: sequelizeMock,
    User: usersModel,
    SoundFile: soundFilesModel,
    Meditation: meditationsModel,
    JobQueue: jobQueueModel,
    ContractUserMeditation: contractUserMeditationsModel,
  }),
}));

jest.mock("../../src/services/workerClient", () => {
  class WorkerConflictError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "WorkerConflictError";
    }
  }

  return {
    requestWorkerBackup: jest.fn(),
    WorkerConflictError,
  };
});

const mockedRequestWorkerBackup = jest.requireMock("../../src/services/workerClient")
  .requestWorkerBackup as jest.Mock;

describe("database routes", () => {
  const adminToken = issueAccessToken({
    id: 1,
    email: "admin@example.com",
    isAdmin: true,
    authProvider: "local",
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    process.env.PATH_PROJECT_RESOURCES = path.join(os.tmpdir(), "golightly04-database-tests");
    await fs.rm(process.env.PATH_PROJECT_RESOURCES, { recursive: true, force: true });
    usersModel.findAll.mockResolvedValue([{ id: 1, email: "user@example.com" }]);
    soundFilesModel.findAll.mockResolvedValue([]);
    meditationsModel.findAll.mockResolvedValue([]);
    jobQueueModel.findAll.mockResolvedValue([]);
    contractUserMeditationsModel.findAll.mockResolvedValue([]);
    mockedRequestWorkerBackup.mockResolvedValue(undefined);
  });

  it("queues a worker backup and lists full backup directory files", async () => {
    const backupsDir = path.join(process.env.PATH_PROJECT_RESOURCES!, "backups_db_and_data");
    await fs.mkdir(backupsDir, { recursive: true });
    await fs.writeFile(path.join(backupsDir, "backup_test.zip"), "zip");
    const app = buildApp();

    const createResponse = await request(app)
      .post("/database/create-backup")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ includeResources: false });

    expect(createResponse.status).toBe(202);
    expect(createResponse.body.message).toBe("Backup job queued");
    expect(createResponse.body.queuedAt).toEqual(expect.any(String));
    expect(mockedRequestWorkerBackup).toHaveBeenCalledWith({ includeResources: false });

    const listResponse = await request(app)
      .get("/database/backups-list")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.count).toBe(1);
    expect(listResponse.body.backups[0].filename).toBe("backup_test.zip");
  });

  it("propagates worker backup conflict and unavailable errors", async () => {
    const { WorkerConflictError } = await import("../../src/services/workerClient");
    mockedRequestWorkerBackup.mockRejectedValueOnce(
      new WorkerConflictError("running"),
    );

    const conflictResponse = await request(buildApp())
      .post("/database/create-backup")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ includeResources: true });

    expect(conflictResponse.status).toBe(409);
    expect(conflictResponse.body.error).toBe("A backup job is already running");

    mockedRequestWorkerBackup.mockRejectedValueOnce(new Error("offline"));
    const unavailableResponse = await request(buildApp())
      .post("/database/create-backup")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ includeResources: true });

    expect(unavailableResponse.status).toBe(503);
    expect(unavailableResponse.body.error).toBe(
      "Worker unavailable; backup could not be started",
    );
  });

  it("deletes a backup file", async () => {
    const backupsDir = path.join(process.env.PATH_PROJECT_RESOURCES!, "backups_db_and_data");
    await fs.mkdir(backupsDir, { recursive: true });
    await fs.writeFile(path.join(backupsDir, "backup_test.zip"), "zip");

    const response = await request(buildApp())
      .delete("/database/delete-backup/backup_test.zip")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.filename).toBe("backup_test.zip");
  });

  it("resets table id sequences after replenishing rows with explicit ids", async () => {
    const restoreZip = await createRestoreZip({
      "jobs_queue.csv": [
        "id,meditationId,sequence,type,inputData,status,filePath,attemptCount,lastError,lastAttemptedAt,createdAt,updatedAt",
        "22,5,1,text,{},pending,,0,,,2026-05-17T14:13:33.919Z,2026-05-17T14:13:33.919Z",
      ].join("\n"),
    });

    const response = await request(buildApp())
      .post("/database/replenish-database")
      .set("Authorization", `Bearer ${adminToken}`)
      .attach("file", restoreZip, "restore.zip");

    expect(response.status).toBe(200);
    expect(jobQueueModel.bulkCreate).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: "22" })]),
      expect.objectContaining({ validate: false }),
    );
    expect(sequelizeMock.query).toHaveBeenCalledWith(
      expect.stringContaining("pg_get_serial_sequence"),
      expect.objectContaining({
        bind: ["public.jobs_queue"],
      }),
    );
    expect(response.body.resourcesRestored).toBe(false);
    expect(response.body.resourceFilesRestored).toBe(0);
  });

  it("restores resources when a combined manifest is present", async () => {
    const restoreZip = await createRestoreZip({
      "manifest.json": JSON.stringify({
        created_at: "2026-06-07T00:00:00.000Z",
        app: "GoLightly04",
        environment: "production",
        package_type: "db_and_resources",
        database_tables: ["users"],
        resources_root: "/resources",
        excluded_dirs: ["backups_db", "backups_db_and_data"],
      }),
      "users.csv": "id,email\n1,user@example.com\n",
      "resources/audio/file.mp3": "sound",
      "resources/backups_db/old.zip": "old",
    });

    const response = await request(buildApp())
      .post("/database/replenish-database")
      .set("Authorization", `Bearer ${adminToken}`)
      .attach("file", restoreZip, "restore.zip");

    expect(response.status).toBe(200);
    expect(response.body.resourcesRestored).toBe(true);
    expect(response.body.resourceFilesRestored).toBe(1);
    await expect(
      fs.readFile(path.join(process.env.PATH_PROJECT_RESOURCES!, "audio", "file.mp3"), "utf8"),
    ).resolves.toBe("sound");
    await expect(
      fs.access(path.join(process.env.PATH_PROJECT_RESOURCES!, "backups_db", "old.zip")),
    ).rejects.toThrow();
  });
});
