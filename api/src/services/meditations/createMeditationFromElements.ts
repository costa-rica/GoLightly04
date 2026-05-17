import type { Meditation, SourceMode, MeditationElement } from "@golightly/shared-types";
import type { Transaction } from "sequelize";
import { getDb } from "../../lib/db";
import { AppError } from "../../lib/errors";
import { getPrerecordedAudioPath } from "../../lib/projectPaths";
import { normalizePauseDuration, normalizeSpeed } from "./normalize";

function deriveType(element: MeditationElement): "text" | "sound" | "pause" {
  if (element.text) return "text";
  if (element.sound_file) return "sound";
  if (element.pause_duration) return "pause";
  throw new AppError(400, "VALIDATION_ERROR", "Unable to derive meditation element type");
}

export async function replaceMeditationElements(
  opts: { meditationId: number; elements: MeditationElement[] },
  transaction: Transaction,
): Promise<void> {
  const { JobQueue } = getDb();

  await JobQueue.destroy({ where: { meditationId: opts.meditationId }, transaction });

  for (const [index, element] of opts.elements.entries()) {
    const type = deriveType(element);
    const status: "pending" | "complete" = type === "text" ? "pending" : "complete";
    let filePath: string | null = null;
    let inputData = "";

    if (type === "text") {
      inputData = JSON.stringify({
        text: element.text,
        voice_id: element.voice_id,
        speed: normalizeSpeed(element.speed),
      });
    } else if (type === "sound") {
      if (!element.sound_file) {
        throw new AppError(400, "VALIDATION_ERROR", "sound_file is required for sound elements");
      }
      filePath = getPrerecordedAudioPath(element.sound_file);
      inputData = JSON.stringify({ sound_file: element.sound_file });
    } else {
      inputData = JSON.stringify({
        pause_duration: normalizePauseDuration(element.pause_duration),
      });
    }

    await JobQueue.create(
      {
        meditationId: opts.meditationId,
        sequence: index + 1,
        type,
        inputData,
        status,
        filePath,
        attemptCount: 0,
        lastError: null,
        lastAttemptedAt: null,
      },
      { transaction },
    );
  }
}

export async function createMeditationFromElements(opts: {
  userId: number;
  title: string;
  description: string | null;
  visibility: "public" | "private";
  elements: MeditationElement[];
  sourceMode: SourceMode;
  scriptSource: string | null;
}): Promise<Meditation> {
  const { sequelize, Meditation } = getDb();
  return sequelize.transaction(async (transaction) => {
    const createdMeditation = await Meditation.create(
      {
        userId: opts.userId,
        title: opts.title,
        description: opts.description,
        visibility: opts.visibility,
        sourceMode: opts.sourceMode,
        scriptSource: opts.scriptSource,
        status: "pending",
        meditationArray: opts.elements.map((element, index) => ({
          ...element,
          sequence: index + 1,
        })),
      },
      { transaction },
    );

    await replaceMeditationElements({ meditationId: createdMeditation.id, elements: opts.elements }, transaction);

    return createdMeditation as unknown as Meditation;
  });
}
