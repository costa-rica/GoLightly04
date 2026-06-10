import { mapMeditationRecord } from "../../src/routes/meditations";
import { serializeAdminMeditationRow } from "../../src/routes/admin";
import { createOrRegenerateStagedMeditation } from "../../src/services/meditations/createOrRegenerateStagedMeditation";
import { regenerateMeditationFromScript } from "../../src/services/meditations/regenerateMeditationFromScript";

const mockedNotifyWorker = jest.fn();
const mockedDeleteMeditationAudioFiles = jest.fn();

const transactionMock = { LOCK: { UPDATE: "UPDATE" } };
const sequelizeMock = {
  transaction: jest.fn(async (callback: (transaction: typeof transactionMock) => Promise<unknown>) =>
    callback(transactionMock),
  ),
};

const meditationModel = {
  create: jest.fn(),
  findByPk: jest.fn(),
  findOne: jest.fn(),
};

const jobQueueModel = {
  create: jest.fn(),
  destroy: jest.fn(),
  findOne: jest.fn(),
};

const soundFileModel = {
  findAll: jest.fn(),
};

jest.mock("../../src/lib/db", () => ({
  getDb: () => ({
    sequelize: sequelizeMock,
    Meditation: meditationModel,
    JobQueue: jobQueueModel,
    SoundFile: soundFileModel,
  }),
}));

jest.mock("../../src/services/workerClient", () => ({
  notifyWorker: (...args: unknown[]) => mockedNotifyWorker(...args),
}));

jest.mock("../../src/services/meditations/meditationFileCleanup", () => ({
  deleteMeditationAudioFiles: (...args: unknown[]) => mockedDeleteMeditationAudioFiles(...args),
}));

describe("duration indicator API fields", () => {
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
      stage: "library",
      sourceMode: "spreadsheet",
      scriptSource: null,
      createdAt: new Date("2026-04-22T00:00:00.000Z"),
      updatedAt: new Date("2026-04-23T00:00:00.000Z"),
      listenCount: 0,
      durationSeconds: 120,
      durationSecondsTalking: 65,
      durationSecondsPause: 30,
      durationSecondsSound: 25,
      status: "complete",
      ...overrides,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    jobQueueModel.destroy.mockResolvedValue(0);
    jobQueueModel.findOne.mockResolvedValue(null);
    jobQueueModel.create.mockResolvedValue({});
    soundFileModel.findAll.mockResolvedValue([]);
    mockedNotifyWorker.mockResolvedValue(undefined);
    mockedDeleteMeditationAudioFiles.mockResolvedValue(undefined);
  });

  it("serializes segment durations on meditation records", () => {
    expect(mapMeditationRecord(meditationRecord())).toMatchObject({
      durationSecondsTalking: 65,
      durationSecondsPause: 30,
      durationSecondsSound: 25,
    });
  });

  it("serializes segment durations on admin meditation rows", () => {
    expect(serializeAdminMeditationRow(meditationRecord(), 999)).toMatchObject({
      durationSecondsTalking: 65,
      durationSecondsPause: 30,
      durationSecondsSound: 25,
    });
  });

  it("resets segment durations when regenerating a staged meditation", async () => {
    const update = jest.fn().mockResolvedValue(undefined);
    meditationModel.findOne.mockResolvedValue(
      meditationRecord({
        id: 77,
        stage: "staged",
        status: "complete",
        filePath: "/tmp/old.mp3",
        update,
      }),
    );

    await createOrRegenerateStagedMeditation({
      userId: 10,
      payload: { mode: "spreadsheet", elements: [{ id: 1, text: "Breathe" }] },
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        durationSeconds: null,
        durationSecondsTalking: null,
        durationSecondsPause: null,
        durationSecondsSound: null,
        status: "pending",
      }),
      expect.anything(),
    );
  });

  it("resets segment durations when regenerating from script", async () => {
    const update = jest.fn().mockResolvedValue(undefined);
    const existing = meditationRecord({ id: 88, status: "complete" });
    const locked = meditationRecord({ id: 88, status: "complete", update });
    meditationModel.findByPk
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce(locked);

    await regenerateMeditationFromScript({
      meditationId: 88,
      script: "Breathe",
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        durationSeconds: null,
        durationSecondsTalking: null,
        durationSecondsPause: null,
        durationSecondsSound: null,
        status: "pending",
      }),
      expect.anything(),
    );
  });
});
