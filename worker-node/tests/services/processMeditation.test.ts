const mockedMeditationFindByPk = jest.fn();
const mockedMeditationFindAll = jest.fn();
const mockedJobFindAll = jest.fn();
const mockedJobUpdate = jest.fn();
const mockedGenerateSpeech = jest.fn();
const mockedConcatenateMeditation = jest.fn();

jest.mock("../../src/lib/db", () => ({
  getDb: () => ({
    sequelize: {
      literal: (value: string) => value,
      transaction: async (callback: (transaction: { LOCK: { UPDATE: string } }) => unknown) =>
        callback({ LOCK: { UPDATE: "UPDATE" } }),
    },
    Meditation: {
      findByPk: mockedMeditationFindByPk,
      findAll: mockedMeditationFindAll,
    },
    JobQueue: {
      findAll: mockedJobFindAll,
      findByPk: jest.fn((id: number) =>
        Promise.resolve(
          currentJobs.find((job) => job.id === id) ?? null,
        ),
      ),
      update: mockedJobUpdate,
    },
  }),
}));

jest.mock("../../src/services/elevenLabs", () => ({
  generateSpeech: mockedGenerateSpeech,
}));

jest.mock("../../src/services/concatenator", () => ({
  concatenateMeditation: mockedConcatenateMeditation,
}));

let currentJobs: Array<ReturnType<typeof createJob>> = [];

function createMeditation(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    status: "pending",
    update: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function createJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    meditationId: 1,
    sequence: 1,
    type: "text",
    status: "pending",
    filePath: null,
    inputData: { text: "hello world", voiceId: "voice-a", speed: 1.2 },
    attemptCount: 0,
    update: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("processMeditation", () => {
  beforeEach(() => {
    jest.resetModules();
    mockedMeditationFindByPk.mockReset();
    mockedMeditationFindAll.mockReset();
    mockedJobFindAll.mockReset();
    mockedJobUpdate.mockReset();
    mockedGenerateSpeech.mockReset();
    mockedConcatenateMeditation.mockReset().mockResolvedValue(undefined);
    currentJobs = [];
  });

  it("completes all text jobs then concatenates", async () => {
    const meditation = createMeditation();
    const firstJob = createJob({ id: 10, sequence: 1 });
    const secondJob = createJob({
      id: 11,
      sequence: 2,
      inputData: { text: "next section" },
    });

    mockedMeditationFindByPk.mockResolvedValue(meditation);
    currentJobs = [firstJob, secondJob];
    mockedJobFindAll
      .mockResolvedValueOnce([firstJob, secondJob])
      .mockResolvedValueOnce([
        { ...firstJob, status: "complete" },
        { ...secondJob, status: "complete" },
      ]);
    mockedGenerateSpeech
      .mockResolvedValueOnce("/tmp/job-10.mp3")
      .mockResolvedValueOnce("/tmp/job-11.mp3");

    const { processMeditation } = await import("../../src/processor/processMeditation");
    await processMeditation(1);

    expect(firstJob.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ status: "processing", attemptCount: 1 }),
      expect.any(Object),
    );
    expect(secondJob.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "complete", filePath: "/tmp/job-11.mp3" }),
    );
    expect(mockedConcatenateMeditation).toHaveBeenCalledWith(1);
  });

  it("marks the job and meditation failed when ElevenLabs fails", async () => {
    const meditation = createMeditation();
    const firstJob = createJob();

    mockedMeditationFindByPk.mockResolvedValue(meditation);
    currentJobs = [firstJob];
    mockedJobFindAll.mockResolvedValueOnce([firstJob]);
    mockedGenerateSpeech.mockRejectedValueOnce(new Error("elevenlabs exploded"));

    const { processMeditation } = await import("../../src/processor/processMeditation");

    await expect(processMeditation(1)).rejects.toThrow("elevenlabs exploded");
    expect(firstJob.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: "failed",
        lastError: "elevenlabs exploded",
      }),
    );
    expect(meditation.update).toHaveBeenLastCalledWith(expect.objectContaining({ status: "failed" }));
  });

  it("requeues failed jobs without rewriting them to pending first", async () => {
    const meditation = createMeditation({ status: "failed" });
    const failedJob = createJob({ status: "failed", attemptCount: 1 });

    mockedMeditationFindByPk.mockResolvedValue(meditation);
    currentJobs = [failedJob];
    mockedJobFindAll
      .mockResolvedValueOnce([failedJob])
      .mockResolvedValueOnce([{ ...failedJob, status: "complete" }]);
    mockedGenerateSpeech.mockResolvedValueOnce("/tmp/requeue.mp3");

    const { processMeditation } = await import("../../src/processor/processMeditation");
    await processMeditation(1, "requeue");

    expect(mockedJobUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed" }),
      expect.any(Object),
    );
    expect(failedJob.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ status: "processing", attemptCount: 2 }),
      expect.any(Object),
    );
  });

  it("marks stranded work failed during reconciliation", async () => {
    const meditation = createMeditation({ id: 8, status: "processing" });
    mockedMeditationFindAll.mockResolvedValue([meditation]);
    mockedJobUpdate.mockResolvedValue([2]);

    const { reconcileStuckMeditations } = await import(
      "../../src/processor/processMeditation"
    );
    const reconciled = await reconcileStuckMeditations();

    expect(reconciled).toEqual([8]);
    expect(meditation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
      }),
    );
  });
});
