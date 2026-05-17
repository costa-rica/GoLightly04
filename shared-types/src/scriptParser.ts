import type { MeditationElement, ScriptParseError, ScriptParseResult } from "./meditation";
import type { SoundFile } from "./sounds";
import { PAUSE_MAX, PAUSE_MIN, SPEED_MAX, SPEED_MIN } from "./validation";

type SoundLookup = (bracketText: string) => Pick<SoundFile, "filename"> | null;
type SoundFilenameToNameLookup = (filename: string) => string | null;

type SpeedFrame = {
  speed: number;
  index: number;
};

const BREAK_PATTERN = /^<break\s+time="(\d+(?:\.\d+)?)s"\s*\/>/;
const SPEED_OPEN_PATTERN = /^\{speed=(\d+(?:\.\d+)?)\}/;

function collapseSpeech(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function pushError(errors: ScriptParseError[], message: string, index: number) {
  errors.push({ message, index });
}

function skipMalformedToken(script: string, index: number, fallbackLength: number) {
  const closingIndex = script.indexOf(">", index);
  if (closingIndex >= index) {
    return closingIndex + 1;
  }

  const braceIndex = script.indexOf("}", index);
  if (braceIndex >= index) {
    return braceIndex + 1;
  }

  return index + fallbackLength;
}

export function parseMeditationScript(
  script: string,
  soundLookup: SoundLookup,
): ScriptParseResult {
  const elements: MeditationElement[] = [];
  const errors: ScriptParseError[] = [];
  const speedStack: SpeedFrame[] = [];
  let textBuffer = "";
  let cursor = 0;

  const currentSpeed = () => speedStack.at(-1)?.speed;

  const flushText = () => {
    const text = collapseSpeech(textBuffer);
    textBuffer = "";
    if (!text) {
      return;
    }

    const speed = currentSpeed();
    elements.push({
      id: elements.length + 1,
      text,
      ...(speed === undefined ? {} : { speed }),
    });
  };

  while (cursor < script.length) {
    if (script.startsWith("<break", cursor)) {
      flushText();
      const match = BREAK_PATTERN.exec(script.slice(cursor));
      if (!match) {
        pushError(errors, "Malformed <break/> tag", cursor);
        cursor = skipMalformedToken(script, cursor, "<break".length);
        continue;
      }

      const pauseDuration = Number(match[1]);
      if (pauseDuration <= PAUSE_MIN || pauseDuration > PAUSE_MAX) {
        pushError(errors, "Pause duration must be greater than 0 and no more than 300 seconds", cursor);
      } else {
        elements.push({
          id: elements.length + 1,
          pause_duration: String(pauseDuration),
        });
      }
      cursor += match[0].length;
      continue;
    }

    if (script[cursor] === "[") {
      flushText();
      const newlineIndex = script.indexOf("\n", cursor);
      const closingIndex = script.indexOf("]", cursor + 1);
      if (closingIndex === -1 || (newlineIndex !== -1 && newlineIndex < closingIndex)) {
        pushError(errors, "Unclosed sound bracket", cursor);
        cursor += 1;
        continue;
      }

      const bracketText = script.slice(cursor + 1, closingIndex).trim();
      const sound = soundLookup(bracketText);
      if (!sound) {
        pushError(errors, `Unknown sound: ${bracketText}`, cursor);
      } else {
        elements.push({
          id: elements.length + 1,
          sound_file: sound.filename,
        });
      }
      cursor = closingIndex + 1;
      continue;
    }

    if (script.startsWith("{speed=", cursor)) {
      flushText();
      const match = SPEED_OPEN_PATTERN.exec(script.slice(cursor));
      if (!match) {
        pushError(errors, "Malformed {speed=...} block", cursor);
        cursor = skipMalformedToken(script, cursor, "{speed=".length);
        continue;
      }

      const speed = Number(match[1]);
      if (speed < SPEED_MIN || speed > SPEED_MAX) {
        pushError(errors, `Speed must be between ${SPEED_MIN} and ${SPEED_MAX}`, cursor);
      }
      speedStack.push({ speed, index: cursor });
      cursor += match[0].length;
      continue;
    }

    if (script.startsWith("{/speed}", cursor)) {
      flushText();
      if (speedStack.length === 0) {
        pushError(errors, "Unmatched {/speed}", cursor);
      } else {
        speedStack.pop();
      }
      cursor += "{/speed}".length;
      continue;
    }

    textBuffer += script[cursor];
    cursor += 1;
  }

  flushText();

  for (const frame of speedStack) {
    pushError(errors, "Unclosed {speed=...} block", frame.index);
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, elements };
}

/**
 * Serializes meditation elements back to editable script syntax.
 *
 * `voice_id` has no representation in the script format. Spreadsheet-created
 * meditations that used per-element voices will collapse to the default voice
 * after a script edit/regeneration.
 */
export function serializeMeditationElementsToScript(
  elements: MeditationElement[],
  soundFilenameToName: SoundFilenameToNameLookup,
): string {
  return elements
    .flatMap((element) => {
      if (element.text) {
        const speed = typeof element.speed === "number" && Number.isFinite(element.speed) ? element.speed : null;
        return speed === null ? element.text : `{speed=${speed}}${element.text}{/speed}`;
      }

      if (element.pause_duration !== undefined) {
        const pauseDuration = Number(element.pause_duration);
        if (pauseDuration <= PAUSE_MIN || pauseDuration > PAUSE_MAX || !Number.isFinite(pauseDuration)) {
          return [];
        }
        return `<break time="${pauseDuration}s"/>`;
      }

      if (element.sound_file) {
        const name = soundFilenameToName(element.sound_file);
        return name ? `[${name}]` : `[unknown sound: ${element.sound_file}]`;
      }

      return [];
    })
    .join("\n\n");
}
