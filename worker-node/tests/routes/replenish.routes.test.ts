import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import request from "supertest";

const mockedReplenishDatabase = jest.fn();
const mockedIsReplenishRunning = jest.fn();
const mockedIsBackupRunning = jest.fn();
const mockedIsAnyMeditationActive = jest.fn();

jest.mock("../../src/services/replenishService", () => ({
  isReplenishRunning: mockedIsReplenishRunning,
  replenishDatabase: mockedReplenishDatabase,
}));

jest.mock("../../src/services/backupService", () => ({
  createBackup: jest.fn(),
  isBackupRunning: mockedIsBackupRunning,
}));

jest.mock("../../src/processor/processMeditation", () => ({
  isAnyMeditationActive: mockedIsAnyMeditationActive,
  isMeditationActive: jest.fn(),
  processMeditation: jest.fn(),
}));

jest.mock("../../src/lib/db", () => ({
  getDb: () => ({
    Meditation: {
      findByPk: jest.fn(),
    },
  }),
}));

describe("POST /replenish", () => {
  let resourceRoot: string;

  beforeEach(async () => {
    jest.clearAllMocks();
    resourceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "golightly-replenish-route-"));
    process.env.PATH_PROJECT_RESOURCES = resourceRoot;
    await fs.mkdir(path.join(resourceRoot, "db_replenish"), { recursive: true });
    mockedReplenishDatabase.mockResolvedValue(undefined);
    mockedIsReplenishRunning.mockReturnValue(false);
    mockedIsBackupRunning.mockReturnValue(false);
    mockedIsAnyMeditationActive.mockReturnValue(false);
  });

  afterEach(async () => {
    await fs.rm(resourceRoot, { recursive: true, force: true });
  });

  it("accepts a valid staged replenish file", async () => {
    await fs.writeFile(path.join(resourceRoot, "db_replenish", "restore.zip"), "zip");
    const { createApp } = await import("../../src/app");

    const response = await request(createApp())
      .post("/replenish")
      .send({ filename: "restore.zip" });

    expect(response.status).toBe(202);
    expect(response.body).toEqual({ accepted: true });
    expect(mockedReplenishDatabase).toHaveBeenCalledWith("restore.zip");
  });

  it("returns 409 when replenish is already running", async () => {
    mockedIsReplenishRunning.mockReturnValue(true);
    const { createApp } = await import("../../src/app");

    const response = await request(createApp())
      .post("/replenish")
      .send({ filename: "restore.zip" });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: "A replenish job is already running" });
  });

  it("returns 409 when backup is running", async () => {
    mockedIsBackupRunning.mockReturnValue(true);
    const { createApp } = await import("../../src/app");

    const response = await request(createApp())
      .post("/replenish")
      .send({ filename: "restore.zip" });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: "A backup job is running; replenish cannot start",
    });
  });

  it("returns 409 when meditation processing is active", async () => {
    mockedIsAnyMeditationActive.mockReturnValue(true);
    const { createApp } = await import("../../src/app");

    const response = await request(createApp())
      .post("/replenish")
      .send({ filename: "restore.zip" });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: "Active meditation processing; replenish cannot start",
    });
  });

  it.each([
    [{}],
    [{ filename: 123 }],
    [{ filename: "nested/restore.zip" }],
    [{ filename: "../restore.zip" }],
    [{ filename: "restore.txt" }],
  ])("returns 400 for invalid filename payload %j", async (payload) => {
    const { createApp } = await import("../../src/app");

    const response = await request(createApp()).post("/replenish").send(payload);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "filename must be a .zip basename" });
    expect(mockedReplenishDatabase).not.toHaveBeenCalled();
  });

  it("returns 404 when the staged file does not exist", async () => {
    const { createApp } = await import("../../src/app");

    const response = await request(createApp())
      .post("/replenish")
      .send({ filename: "missing.zip" });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "Replenish file not found" });
    expect(mockedReplenishDatabase).not.toHaveBeenCalled();
  });
});
