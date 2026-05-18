import { parseMeditationScript, SCRIPT_MAX_BYTES, type Meditation } from "@golightly/shared-types";
import { getDb } from "../../lib/db";
import { AppError } from "../../lib/errors";
import { deleteMeditationAudioFiles } from "./meditationFileCleanup";
import { replaceMeditationElements } from "./createMeditationFromElements";

const REGENERATABLE_STATUSES = new Set(["complete", "failed"]);

function assertRegeneratable(status: string | undefined) {
  if (!status || !REGENERATABLE_STATUSES.has(status)) {
    throw new AppError(409, "MEDITATION_BUSY", "Meditation is currently being processed");
  }
}

export async function regenerateMeditationFromScript(opts: {
  meditationId: number;
  script: string;
}): Promise<Meditation> {
  const { sequelize, JobQueue, Meditation, SoundFile } = getDb();

  const existingMeditation = await Meditation.findByPk(opts.meditationId);
  if (!existingMeditation) {
    throw new AppError(404, "NOT_FOUND", "Meditation not found");
  }
  assertRegeneratable(existingMeditation.status);

  if (Buffer.byteLength(opts.script, "utf8") > SCRIPT_MAX_BYTES) {
    throw new AppError(400, "VALIDATION_ERROR", `script must be ${SCRIPT_MAX_BYTES} bytes or less`);
  }

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

  const updatedMeditation = await sequelize.transaction(async (transaction) => {
    const lockedMeditation = await Meditation.findByPk(opts.meditationId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!lockedMeditation) {
      throw new AppError(404, "NOT_FOUND", "Meditation not found");
    }
    assertRegeneratable(lockedMeditation.status);

    const processingJob = await JobQueue.findOne({
      where: { meditationId: opts.meditationId, status: "processing" },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (processingJob) {
      throw new AppError(409, "MEDITATION_BUSY", "Meditation is currently being processed");
    }

    await lockedMeditation.update(
      {
        meditationArray: parseResult.elements.map((element, index) => ({
          ...element,
          sequence: index + 1,
        })),
        scriptSource: opts.script,
        sourceMode: "script",
        filename: null,
        filePath: null,
        durationSeconds: null,
        status: "pending",
      },
      { transaction },
    );

    await replaceMeditationElements(
      { meditationId: opts.meditationId, elements: parseResult.elements },
      transaction,
    );

    return lockedMeditation;
  });

  await deleteMeditationAudioFiles(opts.meditationId);

  return updatedMeditation as unknown as Meditation;
}
