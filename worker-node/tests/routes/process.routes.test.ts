import request from "supertest";

const mockedFindByPk = jest.fn();
const mockedProcessMeditation = jest.fn();
const mockedIsMeditationActive = jest.fn();
const mockedIsAnyMeditationActive = jest.fn();
const mockedIsReplenishRunning = jest.fn();

jest.mock("../../src/lib/db", () => ({
  getDb: () => ({
    Meditation: {
      findByPk: mockedFindByPk,
    },
  }),
}));

jest.mock("../../src/processor/processMeditation", () => ({
  isAnyMeditationActive: mockedIsAnyMeditationActive,
  isMeditationActive: mockedIsMeditationActive,
  processMeditation: mockedProcessMeditation,
}));

jest.mock("../../src/services/replenishService", () => ({
  isReplenishRunning: mockedIsReplenishRunning,
  replenishDatabase: jest.fn(),
}));

describe("POST /process", () => {
  beforeEach(() => {
    mockedFindByPk.mockReset();
    mockedIsAnyMeditationActive.mockReset().mockReturnValue(false);
    mockedIsMeditationActive.mockReset().mockReturnValue(false);
    mockedIsReplenishRunning.mockReset().mockReturnValue(false);
    mockedProcessMeditation.mockReset().mockResolvedValue(undefined);
  });

  it("accepts a pending meditation in intake mode", async () => {
    mockedFindByPk.mockResolvedValue({ id: 1, status: "pending" });
    const { createApp } = await import("../../src/app");

    const response = await request(createApp())
      .post("/process")
      .send({ meditationId: 1, mode: "intake" });

    expect(response.status).toBe(202);
    expect(mockedProcessMeditation).toHaveBeenCalledWith(1, "intake");
  });

  it("accepts a failed meditation in requeue mode", async () => {
    mockedFindByPk.mockResolvedValue({ id: 2, status: "failed" });
    const { createApp } = await import("../../src/app");

    const response = await request(createApp())
      .post("/process")
      .send({ meditationId: 2, mode: "requeue" });

    expect(response.status).toBe(202);
    expect(mockedProcessMeditation).toHaveBeenCalledWith(2, "requeue");
  });

  it("rejects a completed meditation", async () => {
    mockedFindByPk.mockResolvedValue({ id: 3, status: "complete" });
    const { createApp } = await import("../../src/app");

    const response = await request(createApp()).post("/process").send({ meditationId: 3 });

    expect(response.status).toBe(409);
  });

  it("returns 409 when a replenish job is running", async () => {
    mockedIsReplenishRunning.mockReturnValue(true);
    const { createApp } = await import("../../src/app");

    const response = await request(createApp()).post("/process").send({ meditationId: 3 });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: "A replenish job is running; processing cannot start",
    });
    expect(mockedFindByPk).not.toHaveBeenCalled();
    expect(mockedProcessMeditation).not.toHaveBeenCalled();
  });

  it("dedupes a meditation that is already active", async () => {
    mockedIsMeditationActive.mockReturnValue(true);
    const { createApp } = await import("../../src/app");

    const response = await request(createApp()).post("/process").send({ meditationId: 4 });

    expect(response.status).toBe(202);
    expect(response.body.deduped).toBe(true);
    expect(mockedFindByPk).not.toHaveBeenCalled();
    expect(mockedProcessMeditation).not.toHaveBeenCalled();
  });
});
