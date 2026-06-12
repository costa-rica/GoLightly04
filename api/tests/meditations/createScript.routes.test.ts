import os from "os";
import path from "path";
import request from "supertest";
import { buildApp } from "../../src/app";
import { issueAccessToken } from "../../src/lib/authTokens";

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
  destroy: jest.fn(),
};

const soundFileModel = {
  findAll: jest.fn(),
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
    SoundFile: soundFileModel,
    ContractUserMeditation: contractUserMeditationModel,
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
    notifyWorker: jest.fn().mockResolvedValue(undefined),
    WorkerConflictError,
  };
});

jest.mock("../../src/services/meditations/deleteMeditationCascade", () => ({
  deleteMeditationCascade: jest.fn().mockResolvedValue(undefined),
}));

describe("meditations script create route", () => {
  const userToken = issueAccessToken({
    id: 10,
    email: "user@example.com",
    isAdmin: false,
    authProvider: "local",
  });

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.PATH_PROJECT_RESOURCES = path.join(os.tmpdir(), "golightly04-script-routes-tests");
    meditationModel.create.mockResolvedValue({ id: 42 });
    soundFileModel.findAll.mockResolvedValue([
      { id: 1, name: "Tibetan Singing Bowl", filename: "bowl.mp3" },
    ]);
  });

  it("creates a script meditation and queues parsed jobs", async () => {
    const script = [
      "Welcome.",
      '<break time="2s" />',
      "[Tibetan Singing Bowl]",
      "{speed=1.1}Slow breath.{/speed}",
    ].join("\n");

    const response = await request(buildApp())
      .post("/meditations/create/script")
      .set("Authorization", `Bearer ${userToken}`)
      .send({
        title: "Script Morning",
        visibility: "private",
        script,
      });

    expect(response.status).toBe(201);
    expect(response.body.queueId).toBe(42);
    expect(meditationModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceMode: "script",
        scriptSource: script,
      }),
      expect.any(Object),
    );
    expect(jobQueueModel.create).toHaveBeenCalledTimes(4);
    expect(jobQueueModel.create.mock.calls.map((call) => call[0].type)).toEqual([
      "text",
      "pause",
      "sound",
      "text",
    ]);
    expect(jobQueueModel.create.mock.calls.map((call) => call[0].sequence)).toEqual([1, 2, 3, 4]);
    const speedInput = JSON.parse(jobQueueModel.create.mock.calls[3][0].inputData);
    expect(speedInput.speed).toBe(1.1);
    expect(typeof speedInput.speed).toBe("number");
  });

  it("returns structured parse errors for unknown sounds", async () => {
    const response = await request(buildApp())
      .post("/meditations/create/script")
      .set("Authorization", `Bearer ${userToken}`)
      .send({
        title: "Bad Sound",
        visibility: "public",
        script: "[Made Up Sound]",
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("SCRIPT_PARSE_ERROR");
    expect(response.body.error.details).toEqual([
      { message: "Unknown sound: Made Up Sound", index: 0 },
    ]);
    expect(jobQueueModel.create).not.toHaveBeenCalled();
  });

  it("returns structured parse errors for malformed breaks", async () => {
    const response = await request(buildApp())
      .post("/meditations/create/script")
      .set("Authorization", `Bearer ${userToken}`)
      .send({
        title: "Bad Break",
        visibility: "public",
        script: '<break time="3" />',
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("SCRIPT_PARSE_ERROR");
    expect(response.body.error.details[0]).toEqual({
      message: "Malformed <break/> tag",
      index: 0,
    });
  });

  it("validates required fields", async () => {
    const response = await request(buildApp())
      .post("/meditations/create/script")
      .set("Authorization", `Bearer ${userToken}`)
      .send({
        title: "Missing script",
        visibility: "public",
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("requires auth", async () => {
    const response = await request(buildApp())
      .post("/meditations/create/script")
      .send({
        title: "No Auth",
        visibility: "public",
        script: "Hello",
      });

    expect(response.status).toBe(401);
  });

  it("rejects oversize scripts", async () => {
    const response = await request(buildApp())
      .post("/meditations/create/script")
      .set("Authorization", `Bearer ${userToken}`)
      .send({
        title: "Too Long",
        visibility: "public",
        script: "a".repeat(20_001),
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });
});
