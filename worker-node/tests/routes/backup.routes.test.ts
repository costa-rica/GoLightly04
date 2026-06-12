import request from "supertest";

const mockedCreateBackup = jest.fn();
const mockedIsBackupRunning = jest.fn();
const mockedIsReplenishRunning = jest.fn();

jest.mock("../../src/services/backupService", () => ({
  createBackup: mockedCreateBackup,
  isBackupRunning: mockedIsBackupRunning,
}));

jest.mock("../../src/services/replenishService", () => ({
  isReplenishRunning: mockedIsReplenishRunning,
  replenishDatabase: jest.fn(),
}));

jest.mock("../../src/lib/db", () => ({
  getDb: () => ({
    Meditation: {
      findByPk: jest.fn(),
    },
  }),
}));

jest.mock("../../src/processor/processMeditation", () => ({
  isAnyMeditationActive: jest.fn(),
  isMeditationActive: jest.fn(),
  processMeditation: jest.fn(),
}));

describe("POST /backup", () => {
  beforeEach(() => {
    mockedCreateBackup.mockReset().mockResolvedValue(undefined);
    mockedIsBackupRunning.mockReset().mockReturnValue(false);
    mockedIsReplenishRunning.mockReset().mockReturnValue(false);
  });

  it("accepts a backup job and starts it asynchronously", async () => {
    const { createApp } = await import("../../src/app");

    const response = await request(createApp())
      .post("/backup")
      .send({ includeResources: true });

    expect(response.status).toBe(202);
    expect(response.body).toEqual({ accepted: true });
    expect(mockedCreateBackup).toHaveBeenCalledWith({ includeResources: true });
  });

  it("returns 409 when a backup is already running", async () => {
    mockedIsBackupRunning.mockReturnValue(true);
    const { createApp } = await import("../../src/app");

    const response = await request(createApp())
      .post("/backup")
      .send({ includeResources: true });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: "A backup job is already running" });
    expect(mockedCreateBackup).not.toHaveBeenCalled();
  });

  it("returns 409 when a replenish job is running", async () => {
    mockedIsReplenishRunning.mockReturnValue(true);
    const { createApp } = await import("../../src/app");

    const response = await request(createApp())
      .post("/backup")
      .send({ includeResources: true });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: "A replenish job is running; backup cannot start",
    });
    expect(mockedCreateBackup).not.toHaveBeenCalled();
  });

  it("defaults includeResources to true", async () => {
    const { createApp } = await import("../../src/app");

    const response = await request(createApp()).post("/backup").send({});

    expect(response.status).toBe(202);
    expect(mockedCreateBackup).toHaveBeenCalledWith({ includeResources: true });
  });
});
