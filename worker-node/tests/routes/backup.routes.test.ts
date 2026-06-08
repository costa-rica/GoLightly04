import request from "supertest";

const mockedCreateBackup = jest.fn();
const mockedIsBackupRunning = jest.fn();

jest.mock("../../src/services/backupService", () => ({
  createBackup: mockedCreateBackup,
  isBackupRunning: mockedIsBackupRunning,
}));

jest.mock("../../src/lib/db", () => ({
  getDb: () => ({
    Meditation: {
      findByPk: jest.fn(),
    },
  }),
}));

jest.mock("../../src/processor/processMeditation", () => ({
  isMeditationActive: jest.fn(),
  processMeditation: jest.fn(),
}));

describe("POST /backup", () => {
  beforeEach(() => {
    mockedCreateBackup.mockReset().mockResolvedValue(undefined);
    mockedIsBackupRunning.mockReset().mockReturnValue(false);
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

  it("defaults includeResources to true", async () => {
    const { createApp } = await import("../../src/app");

    const response = await request(createApp()).post("/backup").send({});

    expect(response.status).toBe(202);
    expect(mockedCreateBackup).toHaveBeenCalledWith({ includeResources: true });
  });
});
