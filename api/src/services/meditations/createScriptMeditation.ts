import { parseMeditationScript, SCRIPT_MAX_BYTES } from "@golightly/shared-types";
import { getDb } from "../../lib/db";
import { AppError } from "../../lib/errors";
import { createMeditationFromElements } from "./createMeditationFromElements";

export async function createScriptMeditation(opts: {
  userId: number;
  title: string;
  description: string | null;
  visibility: "public" | "private";
  script: string;
  metadata?: Record<string, unknown>;
}) {
  if (Buffer.byteLength(opts.script, "utf8") > SCRIPT_MAX_BYTES) {
    throw new AppError(400, "VALIDATION_ERROR", `script must be ${SCRIPT_MAX_BYTES} bytes or less`);
  }

  const { SoundFile } = getDb();
  const sounds = await SoundFile.findAll();
  const soundMap = new Map(
    sounds.map((sound) => [sound.name.trim().toLowerCase(), sound]),
  );
  const parseResult = parseMeditationScript(
    opts.script,
    (bracketText) => soundMap.get(bracketText.trim().toLowerCase()) ?? null,
  );
  if (!parseResult.ok) {
    throw new AppError(400, "SCRIPT_PARSE_ERROR", "Unable to parse meditation script", parseResult.errors);
  }

  return createMeditationFromElements({
    userId: opts.userId,
    title: opts.title,
    description: opts.description,
    visibility: opts.visibility,
    elements: parseResult.elements,
    sourceMode: "script",
    scriptSource: opts.script,
    metadata: opts.metadata,
  });
}
