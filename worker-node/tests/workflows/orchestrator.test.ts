describe("workflowOrchestrator", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env.NODE_ENV = "testing";
    process.env.PATH_TO_LOGS = "./tmp/test-logs";
  });

  it("uses the internal stage 2 workflows and completes successfully", async () => {
    jest.doMock("../../src/modules/csvParser", () => ({
      parseCsvFile: jest.fn(),
      parseMeditationArray: jest.fn(() => [
        { id: "1", text: "hello", voice_id: "voice-1", speed: "0.9" },
      ]),
    }));
    jest.doMock("../../src/modules/queueManager", () => ({
      addJobToQueue: jest.fn(async () => ({ id: 77 })),
      updateJobStatus: jest.fn(async () => undefined),
    }));
    jest.doMock("../../src/modules/fileManager", () => ({
      generateJobFilename: jest.fn(() => "job_user1_20260328_120000.csv"),
    }));
    jest.doMock("../../src/modules/csvWriter", () => ({
      writeJobCsv: jest.fn(() => "/tmp/job_user1_20260328_120000.csv"),
    }));
    jest.doMock("../../src/modules/elevenLabsHandler", () => ({
      runInternalElevenLabsWorkflow: jest.fn(async () => [
        {
          id: "1",
          text: "hello",
          voiceId: "voice-1",
          voiceName: "Calm Voice",
          speed: 0.9,
          fileName: "voice.mp3",
          filePath: "/tmp/voice.mp3",
          outputDirectory: "/tmp",
        },
      ]),
    }));
    jest.doMock("../../src/modules/audioConcatenatorHandler", () => ({
      runInternalAudioConcatenatorWorkflow: jest.fn(async () => ({
        success: true,
        generatedAudio: {
          outputPath: "/tmp/final.mp3",
          audioLengthSeconds: 20,
          outputDirectory: "/tmp",
          outputFileName: "final.mp3",
        },
      })),
    }));
    jest.doMock("../../src/modules/meditationsManager", () => ({
      saveMeditationToDatabase: jest.fn(async () => ({ id: 14 })),
    }));
    jest.doMock("../../src/modules/elevenLabsFilesManager", () => ({
      saveElevenLabsFilesToDatabase: jest.fn(async () => [9]),
      linkMeditationToElevenLabsFiles: jest.fn(async () => [1]),
    }));
    jest.doMock("../../src/modules/soundFilesManager", () => ({
      findSoundFilesInMeditation: jest.fn(async () => []),
      linkMeditationToSoundFiles: jest.fn(async () => []),
    }));

    const { orchestrateMeditationCreation } = await import(
      "../../src/modules/workflowOrchestrator"
    );

    const result = await orchestrateMeditationCreation({
      userId: 1,
      meditationArray: [{ id: "1", text: "hello" }],
    });

    expect(result).toEqual({
      success: true,
      queueId: 77,
      finalFilePath: "/tmp/final.mp3",
    });
  });

  it("marks the queue as failed when an internal workflow fails", async () => {
    const updateJobStatus = jest.fn(async () => undefined);

    jest.doMock("../../src/modules/csvParser", () => ({
      parseCsvFile: jest.fn(),
      parseMeditationArray: jest.fn(() => [
        { id: "1", text: "hello", voice_id: "voice-1", speed: "0.9" },
      ]),
    }));
    jest.doMock("../../src/modules/queueManager", () => ({
      addJobToQueue: jest.fn(async () => ({ id: 88 })),
      updateJobStatus,
    }));
    jest.doMock("../../src/modules/fileManager", () => ({
      generateJobFilename: jest.fn(() => "job_user1_20260328_120000.csv"),
    }));
    jest.doMock("../../src/modules/csvWriter", () => ({
      writeJobCsv: jest.fn(() => "/tmp/job_user1_20260328_120000.csv"),
    }));
    jest.doMock("../../src/modules/elevenLabsHandler", () => ({
      runInternalElevenLabsWorkflow: jest.fn(async () => {
        throw new Error("elevenlabs broke");
      }),
    }));
    jest.doMock("../../src/modules/audioConcatenatorHandler", () => ({
      runInternalAudioConcatenatorWorkflow: jest.fn(),
    }));
    jest.doMock("../../src/modules/meditationsManager", () => ({
      saveMeditationToDatabase: jest.fn(),
    }));
    jest.doMock("../../src/modules/elevenLabsFilesManager", () => ({
      saveElevenLabsFilesToDatabase: jest.fn(),
      linkMeditationToElevenLabsFiles: jest.fn(),
    }));
    jest.doMock("../../src/modules/soundFilesManager", () => ({
      findSoundFilesInMeditation: jest.fn(async () => []),
      linkMeditationToSoundFiles: jest.fn(async () => []),
    }));

    const { orchestrateMeditationCreation } = await import(
      "../../src/modules/workflowOrchestrator"
    );

    const result = await orchestrateMeditationCreation({
      userId: 1,
      meditationArray: [{ id: "1", text: "hello" }],
    });

    expect(result.success).toBe(false);
    expect(result.queueId).toBe(88);
    expect(result.error).toBe("elevenlabs broke");
    expect(updateJobStatus).toHaveBeenLastCalledWith(88, "failed");
  });
});
