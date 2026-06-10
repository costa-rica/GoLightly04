const updateMeditation = jest.fn();

const meditationModel = {
  findByPk: jest.fn(),
};

const jobQueueModel = {
  findAll: jest.fn(),
};

jest.mock("../../src/lib/db", () => ({
  getDb: () => ({
    Meditation: meditationModel,
    JobQueue: jobQueueModel,
  }),
}));

jest.mock("../../src/lib/projectPaths", () => ({
  getMeditationAudioRoot: () => "/tmp/golightly-meditations",
  getPrerecordedAudioRoot: () => "/tmp/golightly-sounds",
}));

jest.mock("@ffmpeg-installer/ffmpeg", () => ({ path: "/usr/bin/ffmpeg" }));
jest.mock("@ffprobe-installer/ffprobe", () => ({ path: "/usr/bin/ffprobe" }));

const ffmpegMock = jest.fn();
const ffprobeMock = jest.fn();

jest.mock("fluent-ffmpeg", () => {
  type HandlerCall = [string, () => void];
  type CommandMock = {
    audioChannels: jest.Mock;
    audioCodec: jest.Mock;
    audioFrequency: jest.Mock;
    duration: jest.Mock;
    format: jest.Mock;
    input: jest.Mock;
    inputFormat: jest.Mock;
    mergeToFile: jest.Mock;
    on: jest.Mock;
    save: jest.Mock;
  };
  const runEndHandlers = (command: CommandMock) => {
    (command.on.mock.calls as HandlerCall[])
      .filter(([event]) => event === "end")
      .forEach(([, handler]) => handler());
  };
  const makeCommand = () => {
    const command = {} as CommandMock;
    Object.assign(command, {
      audioChannels: jest.fn(() => command),
      audioCodec: jest.fn(() => command),
      audioFrequency: jest.fn(() => command),
      duration: jest.fn(() => command),
      format: jest.fn(() => command),
      input: jest.fn(() => command),
      inputFormat: jest.fn(() => command),
      mergeToFile: jest.fn((_output: string, _tempDir: string) => {
        runEndHandlers(command);
        return command;
      }),
      on: jest.fn(() => command),
      save: jest.fn((_output: string) => {
        runEndHandlers(command);
        return command;
      }),
    });
    return command;
  };
  const ffmpeg = (...args: unknown[]) => ffmpegMock(...args) || makeCommand();
  Object.assign(ffmpeg, {
    ffprobe: (...args: unknown[]) => ffprobeMock(...args),
    setFfmpegPath: jest.fn(),
    setFfprobePath: jest.fn(),
  });
  return ffmpeg;
});

import { concatenateMeditation } from "../../src/services/concatenator";

describe("concatenateMeditation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    updateMeditation.mockResolvedValue(undefined);
    meditationModel.findByPk.mockResolvedValue({ id: 99, update: updateMeditation });
    jobQueueModel.findAll.mockResolvedValue([
      {
        id: 1,
        type: "text",
        filePath: "/tmp/synthesized/text.mp3",
        inputData: JSON.stringify({ text: "Breathe" }),
      },
      {
        id: 2,
        type: "pause",
        filePath: null,
        inputData: JSON.stringify({ pause_duration: "7.4" }),
      },
      {
        id: 3,
        type: "sound",
        filePath: null,
        inputData: JSON.stringify({ sound_file: "rain.mp3" }),
      },
    ]);
    ffprobeMock.mockImplementation((filePath: string, callback: Function) => {
      const durationByPath = filePath.includes("normalized-1")
        ? 12
        : filePath.includes("normalized-3")
          ? 34
          : 53;
      callback(null, { format: { duration: durationByPath } });
    });
  });

  it("writes accumulated text, pause, and sound durations", async () => {
    await concatenateMeditation(99);

    expect(updateMeditation).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "complete",
        durationSeconds: 53,
        durationSecondsTalking: 12,
        durationSecondsPause: 7,
        durationSecondsSound: 34,
      }),
    );
  });
});
