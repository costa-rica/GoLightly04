import { parseMeditationScript } from "../src/scriptParser";
import type { SoundFile } from "../src/sounds";

const sounds: SoundFile[] = [
  {
    id: 1,
    name: "Tibetan Singing Bowl",
    filename: "tibetan.mp3",
  },
  {
    id: 2,
    name: "Rain",
    filename: "rain.mp3",
  },
];

function lookup(name: string) {
  return sounds.find((sound) => sound.name.toLowerCase() === name.toLowerCase()) ?? null;
}

function expectError(script: string, expected: string) {
  const result = parseMeditationScript(script, lookup);
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.errors.map((error) => error.message).join("\n")).toContain(expected);
  }
}

describe("parseMeditationScript", () => {
  it("parses pure speech", () => {
    expect(parseMeditationScript("Welcome to the practice.", lookup)).toEqual({
      ok: true,
      elements: [{ id: 1, text: "Welcome to the practice." }],
    });
  });

  it("parses leading and trailing breaks", () => {
    expect(parseMeditationScript('<break time="1s" /> Breathe <break time="1s" />', lookup)).toEqual({
      ok: true,
      elements: [
        { id: 1, pause_duration: "1" },
        { id: 2, text: "Breathe" },
        { id: 3, pause_duration: "1" },
      ],
    });
  });

  it("parses sounds, pauses, and speech in source order", () => {
    expect(parseMeditationScript('Begin [Rain] <break time="2s" /> End [Tibetan Singing Bowl]', lookup)).toEqual({
      ok: true,
      elements: [
        { id: 1, text: "Begin" },
        { id: 2, sound_file: "rain.mp3" },
        { id: 3, pause_duration: "2" },
        { id: 4, text: "End" },
        { id: 5, sound_file: "tibetan.mp3" },
      ],
    });
  });

  it("applies numeric speed to speech inside speed blocks", () => {
    expect(parseMeditationScript("{speed=0.9}slow{/speed}", lookup)).toEqual({
      ok: true,
      elements: [{ id: 1, text: "slow", speed: 0.9 }],
    });
  });

  it("rejects malformed break tags", () => {
    expectError('<break time="3" />', "Malformed <break/> tag");
    expectError('<break time="3s">', "Malformed <break/> tag");
    expectError('<break time="abc s" />', "Malformed <break/> tag");
  });

  it("rejects malformed and unmatched speed blocks", () => {
    expectError("{speed=.9}hello{/speed}", "Malformed {speed=...} block");
    expectError("{speed=1.0}hello", "Unclosed {speed=...} block");
    expectError("{/speed}", "Unmatched {/speed}");
  });

  it("rejects unclosed and unknown sounds", () => {
    expectError("[Unclosed sound", "Unclosed sound bracket");
    const result = parseMeditationScript("[Made Up Sound]", () => null);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toEqual({ message: "Unknown sound: Made Up Sound", index: 0 });
    }
  });

  it("rejects speed and pause values outside the supported range", () => {
    expectError("{speed=2.0}fast{/speed}", "Speed must be between 0.7 and 1.3");
    expectError('<break time="999s" />', "Pause duration must be greater than 0 and no more than 300 seconds");
  });

  it("skips whitespace-only text between tokens", () => {
    expect(parseMeditationScript('[Rain]\n\n<break time="1s" />', lookup)).toEqual({
      ok: true,
      elements: [
        { id: 1, sound_file: "rain.mp3" },
        { id: 2, pause_duration: "1" },
      ],
    });
  });

  it("preserves multi-line and unicode speech after whitespace normalization", () => {
    expect(parseMeditationScript("Breathe\nslowly 🌙\nwith ease.", lookup)).toEqual({
      ok: true,
      elements: [{ id: 1, text: "Breathe slowly 🌙 with ease." }],
    });
  });

  it("assigns 1-based ids in source order", () => {
    const result = parseMeditationScript('One <break time="1s" /> [Rain] Two', lookup);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.elements.map((element) => element.id)).toEqual([1, 2, 3, 4]);
    }
  });
});
