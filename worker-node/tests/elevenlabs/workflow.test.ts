import fs from "fs/promises";
import os from "os";
import path from "path";

describe("internal elevenlabs module", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "golightly-elevenlabs-"));
    process.env.NODE_ENV = "testing";
    process.env.PATH_TO_LOGS = path.join(tempDir, "logs");
    process.env.API_KEY_ELEVEN_LABS = "test-key";
    process.env.PATH_SAVED_ELEVENLABS_AUDIO_MP3_OUTPUT = path.join(
      tempDir,
      "output",
    );
    process.env.DEFAULT_ELEVENLABS_VOICE_ID = "voice-default";
    process.env.DEFAULT_ELEVENLABS_SPEED = "0.9";
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("processes a batch and returns structured generated-file results", async () => {
    const { processElevenLabsBatch } = await import(
      "../../src/modules/elevenlabs/workflow"
    );

    class FakeElevenLabsService {
      async validateVoice(voiceId: string) {
        return {
          voice_id: voiceId,
          name: "Calm Voice",
        };
      }

      async textToSpeech(text: string) {
        return Buffer.from(`audio:${text}`);
      }
    }

    const result = await processElevenLabsBatch(
      {
        requests: [
          {
            id: "row-1",
            text: "hello there",
            voiceId: "",
            speed: Number.NaN,
          },
        ],
      },
      {
        service: new FakeElevenLabsService(),
      },
    );

    expect(result.success).toBe(true);
    expect(result.successCount).toBe(1);
    expect(result.failureCount).toBe(0);
    expect(result.results[0]?.success).toBe(true);
    expect(result.results[0]?.generatedFile?.voiceId).toBe("voice-default");

    const savedPath = result.results[0]?.generatedFile?.filePath;
    expect(savedPath).toBeTruthy();

    const stat = await fs.stat(savedPath!);
    expect(stat.isFile()).toBe(true);
  });

  it("parses legacy csv rows for internal processing", async () => {
    const { parseCSVFile } = await import("../../src/modules/elevenlabs/csvParser");
    const csvDir = path.join(tempDir, "csv");
    await fs.mkdir(csvDir, { recursive: true });
    await fs.writeFile(
      path.join(csvDir, "requests.csv"),
      "id,text,voice_id,speed\n1,hello,voice-a,0.8\n2,world,,\n",
      "utf-8",
    );

    const rows = await parseCSVFile("requests.csv", csvDir);

    expect(rows).toEqual([
      { id: "1", text: "hello", voice_id: "voice-a", speed: "0.8" },
      { id: "2", text: "world", voice_id: undefined, speed: undefined },
    ]);
  });
});
