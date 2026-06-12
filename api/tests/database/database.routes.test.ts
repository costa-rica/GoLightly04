import fs from "fs/promises";
import os from "os";
import path from "path";
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
    requestWorkerReplenish: jest.fn(),
    WorkerConflictError,
  };
});

const mockedRequestWorkerBackup = jest.requireMock("../../src/services/workerClient")
  .requestWorkerBackup as jest.Mock;
const mockedRequestWorkerReplenish = jest.requireMock("../../src/services/workerClient")
  .requestWorkerReplenish as jest.Mock;

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
    mockedRequestWorkerReplenish.mockResolvedValue(undefined);
  });

  it("queues a worker backup and lists full backup directory files", async () => {
    const backupsDir = path.join(process.env.PATH_PROJECT_RESOURCES!, "db_backups_and_data");
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
    const backupsDir = path.join(process.env.PATH_PROJECT_RESOURCES!, "db_backups_and_data");
    await fs.mkdir(backupsDir, { recursive: true });
    await fs.writeFile(path.join(backupsDir, "backup_test.zip"), "zip");

    const response = await request(buildApp())
      .delete("/database/delete-backup/backup_test.zip")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.filename).toBe("backup_test.zip");
  });

  it("stages a replenish upload and delegates it to the worker", async () => {
    const upload = Buffer.from("restore zip");

    const response = await request(buildApp())
      .post("/database/replenish-database")
      .set("Authorization", `Bearer ${adminToken}`)
      .attach("file", upload, "restore.zip");

    expect(response.status).toBe(202);
    expect(response.body).toEqual({
      message: "Replenish queued",
      queuedAt: expect.any(String),
    });
    expect(mockedRequestWorkerReplenish).toHaveBeenCalledTimes(1);
    const filename = mockedRequestWorkerReplenish.mock.calls[0][0].filename as string;
    expect(filename).toMatch(
      /^replenish_\d{8}_\d{9}_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.zip$/,
    );
    await expect(
      fs.readFile(
        path.join(process.env.PATH_PROJECT_RESOURCES!, "db_replenish", filename),
        "utf8",
      ),
    ).resolves.toBe("restore zip");
    expect(sequelizeMock.transaction).not.toHaveBeenCalled();
    expect(usersModel.bulkCreate).not.toHaveBeenCalled();
    expect(jobQueueModel.bulkCreate).not.toHaveBeenCalled();
  });

  it("uses different staged filenames for concurrent replenish uploads", async () => {
    const app = buildApp();

    const responses = await Promise.all([
      request(app)
        .post("/database/replenish-database")
        .set("Authorization", `Bearer ${adminToken}`)
        .attach("file", Buffer.from("a"), "restore-a.zip"),
      request(app)
        .post("/database/replenish-database")
        .set("Authorization", `Bearer ${adminToken}`)
        .attach("file", Buffer.from("b"), "restore-b.zip"),
    ]);

    expect(responses.map((response) => response.status)).toEqual([202, 202]);
    const filenames = mockedRequestWorkerReplenish.mock.calls.map(
      ([payload]) => payload.filename,
    );
    expect(new Set(filenames).size).toBe(2);
  });

  it("deletes the staged file when worker replenish returns a conflict", async () => {
    const { WorkerConflictError } = await import("../../src/services/workerClient");
    mockedRequestWorkerReplenish.mockRejectedValueOnce(new WorkerConflictError("running"));

    const response = await request(buildApp())
      .post("/database/replenish-database")
      .set("Authorization", `Bearer ${adminToken}`)
      .attach("file", Buffer.from("restore zip"), "restore.zip");

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("A replenish job is already running");
    await expect(
      fs.readdir(path.join(process.env.PATH_PROJECT_RESOURCES!, "db_replenish")),
    ).resolves.toEqual([]);
  });

  it("deletes the staged file when worker replenish is unavailable", async () => {
    mockedRequestWorkerReplenish.mockRejectedValueOnce(new Error("offline"));

    const response = await request(buildApp())
      .post("/database/replenish-database")
      .set("Authorization", `Bearer ${adminToken}`)
      .attach("file", Buffer.from("restore zip"), "restore.zip");

    expect(response.status).toBe(503);
    expect(response.body.error).toBe("Worker unavailable; replenish could not be started");
    await expect(
      fs.readdir(path.join(process.env.PATH_PROJECT_RESOURCES!, "db_replenish")),
    ).resolves.toEqual([]);
  });
});
