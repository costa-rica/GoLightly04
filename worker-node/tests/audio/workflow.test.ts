import fs from "fs/promises";
import os from "os";
import path from "path";

describe("internal audio module", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "golightly-audio-"));
    process.env.NODE_ENV = "testing";
    process.env.PATH_TO_LOGS = path.join(tempDir, "logs");
    process.env.PATH_MP3_OUTPUT = path.join(tempDir, "output");
    process.env.PATH_PROJECT_RESOURCES = path.join(tempDir, "resources");

    await fs.mkdir(process.env.PATH_MP3_OUTPUT, { recursive: true });
    await fs.mkdir(process.env.PATH_PROJECT_RESOURCES, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("processes audio steps and returns structured generated output", async () => {
    const { processAudioSequence } = await import(
      "../../src/modules/audio/workflow"
    );
    const inputAudio = path.join(tempDir, "input.mp3");
    await fs.writeFile(inputAudio, "fake-audio", "utf-8");

    const result = await processAudioSequence(
      [
        {
          id: "1",
          audioFilePath: inputAudio,
        },
      ],
      {
        processor: {
          async combineAudioFiles(steps, outputPath) {
            await fs.writeFile(outputPath, JSON.stringify(steps), "utf-8");
            return {
              outputPath,
              audioLengthSeconds: 12.5,
            };
          },
        },
      },
    );

    expect(result.success).toBe(true);
    expect(result.generatedAudio?.audioLengthSeconds).toBe(12.5);
    expect(result.generatedAudio?.outputFileName).toMatch(/^output_\d{8}_\d{6}\.mp3$/);

    const stat = await fs.stat(result.generatedAudio!.outputPath);
    expect(stat.isFile()).toBe(true);
  });

  it("parses legacy audio csv rows", async () => {
    const { parseAudioSequenceCSV } = await import(
      "../../src/modules/audio/csvParser"
    );
    const csvPath = path.join(tempDir, "audio.csv");
    await fs.writeFile(
      csvPath,
      "id,audio_file_name_and_path,pause_duration\n1,/tmp/a.mp3,\n2,,2.5\n",
      "utf-8",
    );

    const steps = await parseAudioSequenceCSV(csvPath);

    expect(steps).toEqual([
      { id: "1", audio_file_name_and_path: "/tmp/a.mp3" },
      { id: "2", pause_duration: 2.5 },
    ]);
  });
});
