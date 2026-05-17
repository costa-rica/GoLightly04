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
  });

  it("creates and lists a backup", async () => {
    const app = buildApp();

    const createResponse = await request(app)
      .post("/database/create-backup")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.filename).toMatch(/backup_.*\.zip$/);

    const listResponse = await request(app)
      .get("/database/backups-list")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.count).toBe(1);
  });

  it("deletes a backup file", async () => {
    const backupsDir = path.join(process.env.PATH_PROJECT_RESOURCES!, "backups_db");
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
  });
});
