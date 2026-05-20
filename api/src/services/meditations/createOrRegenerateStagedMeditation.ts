import {
  parseMeditationScript,
  SCRIPT_MAX_BYTES,
  type GenerateStagedMeditationRequest,
  type Meditation,
  type MeditationElement,
  type SourceMode,
} from "@golightly/shared-types";
import { Op, UniqueConstraintError } from "sequelize";
import { getDb } from "../../lib/db";
import { AppError } from "../../lib/errors";
import { notifyWorker } from "../workerClient";
import { deleteMeditationAudioFiles } from "./meditationFileCleanup";
import { replaceMeditationElements } from "./createMeditationFromElements";

const REGENERATABLE_STATUSES = new Set(["complete", "failed"]);

function assertElements(elements: unknown): MeditationElement[] {
  if (!Array.isArray(elements) || elements.length === 0) {
    throw new AppError(400, "VALIDATION_ERROR", "elements must contain at least one element");
  }
  return elements as MeditationElement[];
}

async function preparePayload(payload: GenerateStagedMeditationRequest): Promise<{
  elements: MeditationElement[];
  sourceMode: SourceMode;
  scriptSource: string | null;
}> {
  if (payload.mode === "spreadsheet") {
    return {
      elements: assertElements(payload.elements),
      sourceMode: "spreadsheet",
      scriptSource: null,
    };
  }

  if (typeof payload.script !== "string" || !payload.script.trim()) {
    throw new AppError(400, "VALIDATION_ERROR", "script is required");
  }
  if (Buffer.byteLength(payload.script, "utf8") > SCRIPT_MAX_BYTES) {
    throw new AppError(400, "VALIDATION_ERROR", `script must be ${SCRIPT_MAX_BYTES} bytes or less`);
  }

  const { SoundFile } = getDb();
  const sounds = await SoundFile.findAll();
  const soundMap = new Map(sounds.map((sound) => [sound.name.trim().toLowerCase(), sound]));
  const parseResult = parseMeditationScript(
    payload.script,
    (bracketText) => soundMap.get(bracketText.trim().toLowerCase()) ?? null,
  );
  if (!parseResult.ok) {
    throw new AppError(400, "SCRIPT_PARSE_ERROR", "Unable to parse meditation script", parseResult.errors);
  }

  return {
    elements: parseResult.elements,
    sourceMode: "script",
    scriptSource: payload.script,
  };
}

async function hasActiveJob(meditationId: number, transaction: any): Promise<boolean> {
  const { JobQueue } = getDb();
  const activeJob = await JobQueue.findOne({
    where: {
      meditationId,
      status: { [Op.in]: ["pending", "processing"] },
    },
    transaction,
    lock: transaction.LOCK?.UPDATE,
  });
  return Boolean(activeJob);
}

export async function createOrRegenerateStagedMeditation(opts: {
  userId: number;
  payload: GenerateStagedMeditationRequest;
}): Promise<Meditation> {
  const prepared = await preparePayload(opts.payload);
  const { sequelize, Meditation } = getDb();
  let shouldDeletePreviousAudio = false;

  const run = async (): Promise<Meditation> => {
    return sequelize.transaction(async (transaction) => {
      const existing = await Meditation.findOne({
        where: { userId: opts.userId, stage: "staged" },
        transaction,
        lock: transaction.LOCK?.UPDATE,
      });

      if (!existing) {
        const created = await Meditation.create(
          {
            userId: opts.userId,
            title: "Untitled staged meditation",
            description: null,
            visibility: "private",
            stage: "staged",
            sourceMode: prepared.sourceMode,
            scriptSource: prepared.scriptSource,
            status: "pending",
            filename: null,
            filePath: null,
            durationSeconds: null,
            meditationArray: prepared.elements.map((element, index) => ({
              ...element,
              sequence: index + 1,
            })),
          },
          { transaction },
        );
        await replaceMeditationElements({ meditationId: created.id, elements: prepared.elements }, transaction);
        return created as unknown as Meditation;
      }

      if ((existing.stage ?? "library") !== "staged") {
        throw new AppError(409, "MEDITATION_BUSY", "Meditation is no longer staged");
      }
      if (!REGENERATABLE_STATUSES.has(existing.status)) {
        throw new AppError(409, "MEDITATION_BUSY", "Meditation is currently being processed");
      }
      if (await hasActiveJob(existing.id, transaction)) {
        throw new AppError(409, "MEDITATION_BUSY", "Meditation is currently being processed");
      }

      shouldDeletePreviousAudio = Boolean(existing.filePath || existing.filename);
      await existing.update(
        {
          title: "Untitled staged meditation",
          description: null,
          visibility: "private",
          sourceMode: prepared.sourceMode,
          scriptSource: prepared.scriptSource,
          filename: null,
          filePath: null,
          durationSeconds: null,
          status: "pending",
          meditationArray: prepared.elements.map((element, index) => ({
            ...element,
            sequence: index + 1,
          })),
        },
        { transaction },
      );
      await replaceMeditationElements({ meditationId: existing.id, elements: prepared.elements }, transaction);
      return existing as unknown as Meditation;
    });
  };

  let meditation: Meditation;
  try {
    meditation = await run();
  } catch (error) {
    if (!(error instanceof UniqueConstraintError)) {
      throw error;
    }
    meditation = await run();
  }

  if (shouldDeletePreviousAudio) {
    await deleteMeditationAudioFiles(meditation.id);
  }
  void notifyWorker(meditation.id, "intake");
  return meditation;
}
