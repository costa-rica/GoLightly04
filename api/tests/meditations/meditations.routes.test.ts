import fs from "fs/promises";
import os from "os";
import path from "path";
import request from "supertest";
import { buildApp } from "../../src/app";
import { issueAccessToken, issueStreamToken } from "../../src/lib/authTokens";

const sequelizeMock = {
  transaction: jest.fn(async (callback: (transaction: object) => Promise<unknown>) =>
    callback({}),
  ),
};

const meditationModel = {
  create: jest.fn(),
  findAll: jest.fn(),
  findByPk: jest.fn(),
};

const jobQueueModel = {
  create: jest.fn(),
};

const contractUserMeditationModel = {
  findAll: jest.fn(),
  findOrCreate: jest.fn(),
  destroy: jest.fn(),
};

jest.mock("../../src/lib/db", () => ({
  getDb: () => ({
    sequelize: sequelizeMock,
    Meditation: meditationModel,
    JobQueue: jobQueueModel,
    ContractUserMeditation: contractUserMeditationModel,
  }),
}));

jest.mock("../../src/services/workerClient", () => ({
  notifyWorker: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../src/services/meditations/deleteMeditationCascade", () => ({
  deleteMeditationCascade: jest.fn().mockResolvedValue(undefined),
}));

describe("meditations routes", () => {
  const userToken = issueAccessToken({
    id: 10,
    email: "user@example.com",
    isAdmin: false,
    authProvider: "local",
  });

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.PATH_PROJECT_RESOURCES = path.join(os.tmpdir(), "golightly04-meditations-tests");
    contractUserMeditationModel.findAll.mockResolvedValue([]);
  });

  it("creates a meditation and queues jobs", async () => {
    meditationModel.create.mockResolvedValue({ id: 42 });

    const response = await request(buildApp())
      .post("/meditations/create")
      .set("Authorization", `Bearer ${userToken}`)
      .send({
        title: "Morning",
        visibility: "public",
        meditationArray: [
          { id: 1, text: "Breathe in" },
          { id: 2, pause_duration: "5" },
        ],
      });

    expect(response.status).toBe(201);
    expect(response.body.queueId).toBe(42);
    expect(jobQueueModel.create).toHaveBeenCalledTimes(2);
  });

  it("lists available meditations", async () => {
    meditationModel.findAll.mockResolvedValue([
      {
        id: 3,
        title: "Evening",
        description: null,
        meditationArray: [],
        filename: null,
        filePath: null,
        visibility: "public",
        createdAt: new Date("2026-04-22T00:00:00.000Z"),
        updatedAt: new Date("2026-04-22T00:00:00.000Z"),
        listenCount: 0,
        status: "pending",
        userId: 10,
      },
    ]);

    const response = await request(buildApp())
      .get("/meditations/all")
      .set("Authorization", `Bearer ${userToken}`);

    expect(response.status).toBe(200);
    expect(response.body.meditations).toHaveLength(1);
    expect(response.body.meditations[0].title).toBe("Evening");
  });

  it("issues a stream token for an accessible meditation", async () => {
    meditationModel.findByPk.mockResolvedValue({
      id: 11,
      userId: 10,
      visibility: "private",
    });

    const response = await request(buildApp())
      .get("/meditations/11/stream-token")
      .set("Authorization", `Bearer ${userToken}`);

    expect(response.status).toBe(200);
    expect(response.body.token).toEqual(expect.any(String));
  });

  it("streams a meditation file with a valid stream token", async () => {
    const baseDir = path.join(os.tmpdir(), "golightly04-stream-tests");
    const filePath = path.join(baseDir, "stream.mp3");
    await fs.mkdir(baseDir, { recursive: true });
    await fs.writeFile(filePath, "stream-data");

    meditationModel.findByPk.mockResolvedValue({
      id: 15,
      userId: 10,
      visibility: "private",
      filePath,
      listenCount: 0,
      save: jest.fn().mockResolvedValue(undefined),
    });

    const token = issueStreamToken(15, 10);
    const response = await request(buildApp()).get(`/meditations/15/stream?token=${token}`);

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("audio/mpeg");
  });
});
