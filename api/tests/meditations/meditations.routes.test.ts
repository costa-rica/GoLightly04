import fs from "fs/promises";
import os from "os";
import path from "path";
import request from "supertest";
import { parseMeditationScript } from "@golightly/shared-types";
import { buildApp } from "../../src/app";
import { issueAccessToken, issueStreamToken } from "../../src/lib/authTokens";

const mockedNotifyWorker = jest.fn();
const mockedDeleteMeditationAudioFiles = jest.fn();
const mockedDeleteMeditationCascade = jest.fn();

const sequelizeMock = {
  transaction: jest.fn(async (callback: (transaction: { LOCK: { UPDATE: string } }) => Promise<unknown>) =>
    callback({ LOCK: { UPDATE: "UPDATE" } }),
  ),
};

const meditationModel = {
  create: jest.fn(),
  findAll: jest.fn(),
  findOne: jest.fn(),
  findByPk: jest.fn(),
};

const jobQueueModel = {
  create: jest.fn(),
  destroy: jest.fn(),
  findOne: jest.fn(),
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

jest.mock("../../src/services/workerClient", () => ({
  notifyWorker: (...args: unknown[]) => mockedNotifyWorker(...args),
}));

jest.mock("../../src/services/meditations/deleteMeditationCascade", () => ({
  deleteMeditationCascade: (...args: unknown[]) => mockedDeleteMeditationCascade(...args),
}));

jest.mock("../../src/services/meditations/meditationFileCleanup", () => ({
  deleteMeditationAudioFiles: (...args: unknown[]) => mockedDeleteMeditationAudioFiles(...args),
}));

describe("meditations routes", () => {
  const userToken = issueAccessToken({
    id: 10,
    email: "user@example.com",
    isAdmin: false,
    authProvider: "local",
  });
  const otherUserToken = issueAccessToken({
    id: 20,
    email: "other@example.com",
    isAdmin: false,
    authProvider: "local",
  });
  const adminToken = issueAccessToken({
    id: 99,
    email: "admin@example.com",
    isAdmin: true,
    authProvider: "local",
  });

  function meditationRecord(overrides: Record<string, unknown> = {}) {
    return {
      id: 50,
      userId: 10,
      title: "Morning",
      description: null,
      meditationArray: [],
      filename: null,
      filePath: null,
      visibility: "public",
      createdAt: new Date("2026-04-22T00:00:00.000Z"),
      updatedAt: new Date("2026-04-22T00:00:00.000Z"),
      listenCount: 0,
      status: "complete",
      isDefault: false,
      metadata: {},
      save: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue(undefined),
      ...overrides,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.PATH_PROJECT_RESOURCES = path.join(os.tmpdir(), "golightly04-meditations-tests");
    contractUserMeditationModel.findAll.mockResolvedValue([]);
    soundFileModel.findAll.mockResolvedValue([]);
    jobQueueModel.destroy.mockResolvedValue(0);
    jobQueueModel.findOne.mockResolvedValue(null);
    jobQueueModel.create.mockResolvedValue({});
    mockedNotifyWorker.mockResolvedValue(undefined);
    mockedDeleteMeditationAudioFiles.mockResolvedValue(undefined);
    mockedDeleteMeditationCascade.mockResolvedValue(undefined);
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
          { id: 1, text: "Breathe in", speed: "0.9" },
          { id: 2, pause_duration: "5" },
        ],
      });

    expect(response.status).toBe(201);
    expect(response.body.queueId).toBe(42);
    expect(jobQueueModel.create).toHaveBeenCalledTimes(2);
    const firstJob = jobQueueModel.create.mock.calls[0][0];
    const inputData = JSON.parse(firstJob.inputData);
    expect(inputData.speed).toBe(0.9);
    expect(typeof inputData.speed).toBe("number");
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

  it("streams a private meditation with an admin stream token", async () => {
    const baseDir = path.join(os.tmpdir(), "golightly04-admin-stream-tests");
    const filePath = path.join(baseDir, "stream.mp3");
    await fs.mkdir(baseDir, { recursive: true });
    await fs.writeFile(filePath, "stream-data");

    meditationModel.findByPk.mockResolvedValue({
      id: 16,
      userId: 10,
      visibility: "private",
      status: "complete",
      filePath,
      listenCount: 0,
      save: jest.fn().mockResolvedValue(undefined),
    });

    const token = issueStreamToken(16, 99, true);
    const response = await request(buildApp()).get(`/meditations/16/stream?token=${token}`);

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("audio/mpeg");
  });

  it("streams the default meditation without an owner token", async () => {
    const baseDir = path.join(os.tmpdir(), "golightly04-default-stream-tests");
    const filePath = path.join(baseDir, "stream.mp3");
    await fs.mkdir(baseDir, { recursive: true });
    await fs.writeFile(filePath, "stream-data");

    meditationModel.findByPk.mockResolvedValue({
      id: 17,
      userId: 10,
      visibility: "private",
      status: "complete",
      isDefault: true,
      filePath,
      listenCount: 0,
      save: jest.fn().mockResolvedValue(undefined),
    });

    const response = await request(buildApp()).get("/meditations/17/stream");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("audio/mpeg");
  });

  it("returns serialized script when scriptSource is null", async () => {
    soundFileModel.findAll.mockResolvedValue([{ id: 1, name: "Rain", filename: "rain.mp3" }]);
    meditationModel.findByPk.mockResolvedValue(
      meditationRecord({
        meditationArray: [
          { id: 1, text: "Begin", speed: 0.9 },
          { id: 2, pause_duration: "2" },
          { id: 3, sound_file: "rain.mp3" },
        ],
        scriptSource: null,
      }),
    );

    const response = await request(buildApp()).get("/meditations/50");

    expect(response.status).toBe(200);
    expect(response.body.meditation.scriptSource).toContain("[Rain]");
    const parsed = parseMeditationScript(
      response.body.meditation.scriptSource,
      (name) => (name === "Rain" ? { filename: "rain.mp3" } : null),
    );
    expect(parsed).toEqual({
      ok: true,
      elements: [
        { id: 1, text: "Begin", speed: 0.9 },
        { id: 2, pause_duration: "2" },
        { id: 3, sound_file: "rain.mp3" },
      ],
    });
  });

  it("filters all meditations by ownership, completion, and admin status", async () => {
    meditationModel.findAll.mockResolvedValue([]);

    await request(buildApp()).get("/meditations/all");
    expect(meditationModel.findAll).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { stage: "library", isDefault: false, visibility: "public", status: "complete" },
      }),
    );

    await request(buildApp()).get("/meditations/all").set("Authorization", `Bearer ${userToken}`);
    const authedWhere = meditationModel.findAll.mock.calls.at(-1)?.[0].where;
    const opSymbol = Object.getOwnPropertySymbols(authedWhere)[0];
    expect(authedWhere[opSymbol]).toEqual([
      { visibility: "public", status: "complete" },
      { userId: 10 },
    ]);
    expect(authedWhere.stage).toBe("library");
    expect(authedWhere.isDefault).toBe(false);

    await request(buildApp()).get("/meditations/all").set("Authorization", `Bearer ${adminToken}`);
    expect(meditationModel.findAll).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { stage: "library", isDefault: false },
      }),
    );
  });

  it("returns the default meditation without ordinary list filters", async () => {
    soundFileModel.findAll.mockResolvedValue([]);
    meditationModel.findOne.mockResolvedValue(
      meditationRecord({
        id: 77,
        title: "Default",
        visibility: "private",
        isDefault: true,
      }),
    );

    const response = await request(buildApp()).get("/meditations/default");

    expect(response.status).toBe(200);
    expect(response.body.meditation).toMatchObject({
      id: 77,
      title: "Default",
      visibility: "private",
      isDefault: true,
    });
    expect(meditationModel.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isDefault: true },
      }),
    );
  });

  it("returns structured no-default errors", async () => {
    meditationModel.findOne.mockResolvedValue(null);

    const response = await request(buildApp()).get("/meditations/default");

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("NO_DEFAULT_MEDITATION");
  });

  it("looks up imports by owner-scoped provenance metadata", async () => {
    meditationModel.findOne.mockResolvedValue(
      meditationRecord({
        id: 88,
        visibility: "private",
        metadata: {
          sourceUserKey: "nick",
          sourceFile: "one.md",
        },
      }),
    );

    const response = await request(buildApp())
      .get("/meditations/imports?sourceUserKey=nick&sourceFile=one.md")
      .set("Authorization", `Bearer ${userToken}`);

    expect(response.status).toBe(200);
    expect(response.body.duplicate).toBe(true);
    expect(response.body.meditation.id).toBe(88);
    expect(meditationModel.findOne.mock.calls[0][0].where.userId).toBe(10);
  });

  it("skips duplicate imports without mutation when overwrite is false", async () => {
    meditationModel.findOne.mockResolvedValue(meditationRecord({ id: 91, visibility: "private" }));

    const response = await request(buildApp())
      .post("/meditations/imports")
      .set("Authorization", `Bearer ${userToken}`)
      .send({
        title: "Imported",
        script: "Hello",
        importMetadata: {
          sourceUserKey: "nick",
          sourceFile: "one.md",
          sourceRoot: "/tmp/source",
          importedAt: "2026-06-11T00:00:00.000Z",
          checksum: `sha256:${"a".repeat(64)}`,
        },
      });

    expect(response.status).toBe(200);
    expect(response.body.action).toBe("duplicate");
    expect(meditationModel.create).not.toHaveBeenCalled();
    expect(mockedDeleteMeditationCascade).not.toHaveBeenCalled();
  });

  it("creates a new private import when no duplicate exists", async () => {
    meditationModel.findOne.mockResolvedValue(null);
    meditationModel.create.mockResolvedValue(
      meditationRecord({
        id: 93,
        title: "Imported",
        visibility: "private",
        metadata: {
          sourceUserKey: "nick",
          sourceFile: "new.md",
        },
      }),
    );

    const response = await request(buildApp())
      .post("/meditations/imports")
      .set("Authorization", `Bearer ${userToken}`)
      .send({
        title: "Imported",
        script: "Hello",
        importMetadata: {
          sourceUserKey: "nick",
          sourceFile: "new.md",
          sourceRoot: "/tmp/source",
          importedAt: "2026-06-11T00:00:00.000Z",
          checksum: `sha256:${"c".repeat(64)}`,
        },
      });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      action: "created",
      meditation: { id: 93, visibility: "private" },
    });
    expect(meditationModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        visibility: "private",
        sourceMode: "script",
        metadata: expect.objectContaining({
          sourceUserKey: "nick",
          sourceFile: "new.md",
        }),
      }),
      expect.any(Object),
    );
    expect(mockedNotifyWorker).toHaveBeenCalledWith(93, "intake");
  });

  it("overwrites imports through delete and recreate with a new id", async () => {
    meditationModel.findOne.mockResolvedValue(meditationRecord({ id: 91, visibility: "private" }));
    meditationModel.create.mockResolvedValue(
      meditationRecord({
        id: 92,
        title: "Imported",
        visibility: "private",
        metadata: {
          sourceUserKey: "nick",
          sourceFile: "one.md",
        },
      }),
    );

    const response = await request(buildApp())
      .post("/meditations/imports")
      .set("Authorization", `Bearer ${userToken}`)
      .send({
        title: "Imported",
        script: "Hello",
        overwrite: true,
        importMetadata: {
          sourceUserKey: "nick",
          sourceFile: "one.md",
          sourceRoot: "/tmp/source",
          importedAt: "2026-06-11T00:00:00.000Z",
          checksum: `sha256:${"b".repeat(64)}`,
        },
      });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      action: "overwritten",
      previousMeditationId: 91,
      meditation: { id: 92 },
    });
    expect(mockedDeleteMeditationCascade).toHaveBeenCalledWith(91);
    expect(meditationModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        visibility: "private",
        sourceMode: "script",
        metadata: expect.objectContaining({
          sourceUserKey: "nick",
          sourceFile: "one.md",
        }),
      }),
      expect.any(Object),
    );
  });

  it.each([
    ["non-owner public complete", otherUserToken, "complete", 200],
    ["non-owner public pending", otherUserToken, "pending", 403],
    ["non-owner public processing", otherUserToken, "processing", 403],
    ["owner public pending", userToken, "pending", 200],
    ["admin public pending", adminToken, "pending", 200],
    ["anonymous public pending", null, "pending", 403],
  ])("applies GET /:id access for %s", async (_label, token, status, expectedStatus) => {
    meditationModel.findByPk.mockResolvedValue(meditationRecord({ status }));

    const req = request(buildApp()).get("/meditations/50");
    if (token) {
      req.set("Authorization", `Bearer ${token}`);
    }
    const response = await req;

    expect(response.status).toBe(expectedStatus);
  });

  it.each([
    ["authenticated non-owner public complete", otherUserToken, "complete", 200],
    ["authenticated non-owner public pending", otherUserToken, "pending", 403],
    ["owner public pending", userToken, "pending", 200],
    ["admin public pending", adminToken, "pending", 200],
  ])("applies stream-token access for %s", async (_label, token, status, expectedStatus) => {
    meditationModel.findByPk.mockResolvedValue(meditationRecord({ status }));

    const response = await request(buildApp())
      .get("/meditations/50/stream-token")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(expectedStatus);
  });

  it("requires auth before issuing a stream token", async () => {
    meditationModel.findByPk.mockResolvedValue(meditationRecord({ status: "pending" }));

    const response = await request(buildApp()).get("/meditations/50/stream-token");

    expect(response.status).toBe(401);
  });

  it("rejects public pending stream access before the filePath readiness check", async () => {
    meditationModel.findByPk.mockResolvedValue(meditationRecord({ status: "pending", filePath: null }));

    const response = await request(buildApp())
      .get("/meditations/50/stream")
      .set("Authorization", `Bearer ${otherUserToken}`);

    expect(response.status).toBe(403);
  });

  it("regenerates script meditations and notifies after cleanup", async () => {
    const lockedMeditation = meditationRecord({
      id: 55,
      status: "complete",
      scriptSource: "Hello\n[Rain]",
    });
    meditationModel.findByPk
      .mockResolvedValueOnce(meditationRecord({ id: 55, status: "complete" }))
      .mockResolvedValueOnce(meditationRecord({ id: 55, status: "complete" }))
      .mockResolvedValueOnce(lockedMeditation);
    soundFileModel.findAll.mockResolvedValue([{ id: 1, name: "Rain", filename: "rain.mp3" }]);

    const response = await request(buildApp())
      .put("/meditations/55/script")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ script: "Hello\n[Rain]" });

    expect(response.status).toBe(200);
    expect(lockedMeditation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        scriptSource: "Hello\n[Rain]",
        sourceMode: "script",
        filename: null,
        filePath: null,
        status: "pending",
      }),
      expect.any(Object),
    );
    expect(jobQueueModel.destroy).toHaveBeenCalledWith(expect.objectContaining({ where: { meditationId: 55 } }));
    expect(jobQueueModel.create).toHaveBeenCalledTimes(2);
    expect(mockedDeleteMeditationAudioFiles).toHaveBeenCalledWith(55);
    expect(mockedNotifyWorker).toHaveBeenCalledWith(55, "intake");
    expect(mockedDeleteMeditationAudioFiles.mock.invocationCallOrder[0]).toBeLessThan(
      mockedNotifyWorker.mock.invocationCallOrder[0],
    );
  });

  it("rejects script regeneration for non-owners without writes", async () => {
    meditationModel.findByPk.mockResolvedValue(meditationRecord({ userId: 10 }));

    const response = await request(buildApp())
      .put("/meditations/50/script")
      .set("Authorization", `Bearer ${otherUserToken}`)
      .send({ script: "Hello" });

    expect(response.status).toBe(403);
    expect(jobQueueModel.destroy).not.toHaveBeenCalled();
    expect(mockedDeleteMeditationAudioFiles).not.toHaveBeenCalled();
    expect(mockedNotifyWorker).not.toHaveBeenCalled();
  });

  it("returns parse errors for malformed regeneration scripts", async () => {
    meditationModel.findByPk
      .mockResolvedValueOnce(meditationRecord({ status: "complete" }))
      .mockResolvedValueOnce(meditationRecord({ status: "complete" }));
    soundFileModel.findAll.mockResolvedValue([]);

    const response = await request(buildApp())
      .put("/meditations/50/script")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ script: "[Missing Sound]" });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("SCRIPT_PARSE_ERROR");
    expect(response.body.error.details).toEqual([{ message: "Unknown sound: Missing Sound", index: 0 }]);
  });

  it.each([
    ["processing", "processing"],
    ["pending", "pending"],
  ])("rejects regeneration when fast-path status is %s", async (_label, status) => {
    meditationModel.findByPk
      .mockResolvedValueOnce(meditationRecord({ status }))
      .mockResolvedValueOnce(meditationRecord({ status }));

    const response = await request(buildApp())
      .put("/meditations/50/script")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ script: "Hello" });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("MEDITATION_BUSY");
  });

  it("rejects regeneration when transaction-time status changes to processing", async () => {
    meditationModel.findByPk
      .mockResolvedValueOnce(meditationRecord({ status: "complete" }))
      .mockResolvedValueOnce(meditationRecord({ status: "complete" }))
      .mockResolvedValueOnce(meditationRecord({ status: "processing" }));

    const response = await request(buildApp())
      .put("/meditations/50/script")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ script: "Hello" });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("MEDITATION_BUSY");
  });

  it("rejects regeneration when a processing job still exists", async () => {
    meditationModel.findByPk
      .mockResolvedValueOnce(meditationRecord({ status: "complete" }))
      .mockResolvedValueOnce(meditationRecord({ status: "complete" }))
      .mockResolvedValueOnce(meditationRecord({ status: "complete" }));
    jobQueueModel.findOne.mockResolvedValue({ id: 999 });

    const response = await request(buildApp())
      .put("/meditations/50/script")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ script: "Hello" });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("MEDITATION_BUSY");
  });

  it("rejects oversize regeneration scripts", async () => {
    const response = await request(buildApp())
      .put("/meditations/50/script")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ script: "x".repeat(20_001) });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });
});
