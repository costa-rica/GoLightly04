import { Op } from "sequelize";

import logger from "../config/logger";
import { getDb } from "../lib/db";
import { toErrorMessage } from "../lib/errors";
import { concatenateMeditation } from "../services/concatenator";
import { generateSpeech } from "../services/elevenLabs";

type WorkerMode = "intake" | "requeue";
const activeMeditations = new Set<number>();

function parseInputData(inputData: unknown): Record<string, unknown> {
  if (typeof inputData === "string") {
    try {
      return JSON.parse(inputData) as Record<string, unknown>;
    } catch (_error) {
      return {};
    }
  }

  if (!inputData || typeof inputData !== "object") {
    return {};
  }

  return inputData as Record<string, unknown>;
}

export async function processMeditation(
  meditationId: number,
  mode: WorkerMode = "intake",
) {
  activeMeditations.add(meditationId);

  try {
  const db = getDb();
  const meditation = await db.Meditation.findByPk(meditationId);

  if (!meditation) {
    throw new Error(`Meditation ${meditationId} not found`);
  }

  logger.info(`Meditation ${meditationId} processing started (mode=${mode})`);
  await meditation.update({ status: "processing" });

  if (mode === "requeue") {
    await db.JobQueue.update(
      {
        status: "failed",
        lastError: db.sequelize.literal(
          "COALESCE(last_error, 'worker interrupted before completion')",
        ),
      },
      {
        where: {
          meditationId,
          status: "processing",
        },
      },
    );
  }

  const where =
    mode === "intake"
      ? { meditationId, status: "pending" }
      : { meditationId, status: { [Op.ne]: "complete" } };

  const jobs = await db.JobQueue.findAll({
    where,
    order: [["sequence", "ASC"]],
  });

  for (const job of jobs) {
    if (job.type !== "text") {
      if (job.status !== "complete") {
        await job.update({ status: "complete", lastError: null });
      }
      continue;
    }

    const claimedJob =
      typeof db.sequelize.transaction === "function"
        ? await db.sequelize.transaction(async (transaction: any) => {
            const lockedJob = await db.JobQueue.findByPk(job.id, {
              transaction,
              lock: transaction.LOCK?.UPDATE,
            } as any);

            if (!lockedJob || lockedJob.status === "complete") {
              return null;
            }

            await lockedJob.update(
              {
                status: "processing",
                attemptCount: lockedJob.attemptCount + 1,
                lastAttemptedAt: new Date(),
              },
              { transaction } as any,
            );

            return lockedJob;
          })
        : job;

    if (!claimedJob) {
      continue;
    }

    if (typeof db.sequelize.transaction !== "function") {
      await claimedJob.update({
        status: "processing",
        attemptCount: claimedJob.attemptCount + 1,
        lastAttemptedAt: new Date(),
      });
    }

    const inputData = parseInputData(claimedJob.inputData);

    try {
      const filePath = await generateSpeech({
        text: String(inputData.text ?? ""),
        meditationId,
        jobId: claimedJob.id,
        sequence: claimedJob.sequence,
        voiceId:
          typeof inputData.voiceId === "string" ? inputData.voiceId : undefined,
        speed:
          typeof inputData.speed === "number" ? inputData.speed : undefined,
      });

      await claimedJob.update({
        status: "complete",
        filePath,
        lastError: null,
      });
      logger.info(`Meditation ${meditationId} job ${claimedJob.id} sequence ${claimedJob.sequence} complete`);
    } catch (error) {
      const message = toErrorMessage(error);
      await claimedJob.update({
        status: "failed",
        lastError: message,
        lastAttemptedAt: new Date(),
      });
      await meditation.update({
        status: "failed",
      });
      logger.error(
        `Meditation ${meditationId} job ${claimedJob.id} sequence ${claimedJob.sequence} failed: ${message}`,
      );
      throw error;
    }
  }

  const allJobs = await db.JobQueue.findAll({
    where: { meditationId },
  });

  if (allJobs.every((job: { status: string }) => job.status === "complete")) {
    logger.info(`Meditation ${meditationId} all jobs complete — starting concatenation`);
    await concatenateMeditation(meditationId);
    logger.info(`Meditation ${meditationId} complete`);
  }
  } finally {
    activeMeditations.delete(meditationId);
  }
}

export async function reconcileStuckMeditations() {
  const db = getDb();
  const meditations = await db.Meditation.findAll({
    where: {
      status: {
        [Op.in]: ["pending", "processing"],
      },
    },
  });

  const reconciled: number[] = [];

  for (const meditation of meditations) {
    const [updatedRows] = await db.JobQueue.update(
      {
        status: "failed",
        lastError: "worker interrupted before completion",
      },
      {
        where: {
          meditationId: meditation.id,
          status: {
            [Op.in]: ["pending", "processing"],
          },
        },
      },
    );

    if (updatedRows > 0) {
      await meditation.update({
        status: "failed",
      });
      reconciled.push(meditation.id);
      logger.warn(`Reconciled meditation ${meditation.id}`);
    }
  }

  return reconciled;
}

export function isMeditationActive(meditationId: number) {
  return activeMeditations.has(meditationId);
}
