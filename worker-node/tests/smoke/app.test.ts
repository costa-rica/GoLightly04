import request from "supertest";

const mockedFindByPk = jest.fn();
const mockedProcessMeditation = jest.fn();
const mockedIsMeditationActive = jest.fn();

jest.mock("../../src/lib/db", () => ({
  getDb: () => ({
    Meditation: {
      findByPk: mockedFindByPk,
    },
  }),
}));

jest.mock("../../src/processor/processMeditation", () => ({
  isMeditationActive: mockedIsMeditationActive,
  processMeditation: mockedProcessMeditation,
}));

describe("worker app smoke", () => {
  beforeEach(() => {
    mockedFindByPk.mockReset();
    mockedIsMeditationActive.mockReset().mockReturnValue(false);
    mockedProcessMeditation.mockReset().mockResolvedValue(undefined);
  });

  it("returns 404 when meditation does not exist", async () => {
    mockedFindByPk.mockResolvedValue(null);
    const { createApp } = await import("../../src/app");
    const app = createApp();

    const response = await request(app).post("/process").send({ meditationId: 55 });

    expect(response.status).toBe(404);
  });
});
