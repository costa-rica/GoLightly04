import { Op } from "sequelize";
import type { Meditation } from "@golightly/shared-types";
import { getDb } from "../../lib/db";
import { AppError } from "../../lib/errors";
import { validateMeditationMetadata } from "./validateMeditationMetadata";

export async function saveStagedToLibrary(opts: {
  userId: number;
  metadata: {
    title: unknown;
    description?: unknown;
    visibility: unknown;
  };
}): Promise<Meditation> {
  const metadata = validateMeditationMetadata(opts.metadata);
  const { sequelize, JobQueue, Meditation } = getDb();

  return sequelize.transaction(async (transaction) => {
    const staged = await Meditation.findOne({
      where: { userId: opts.userId, stage: "staged" },
      transaction,
      lock: transaction.LOCK?.UPDATE,
    });
    if (!staged) {
      throw new AppError(404, "NOT_FOUND", "Staged meditation not found");
    }
    if ((staged.stage ?? "library") !== "staged" || staged.status !== "complete") {
      throw new AppError(409, "MEDITATION_BUSY", "Staged meditation is not ready to save");
    }

    const activeJob = await JobQueue.findOne({
      where: {
        meditationId: staged.id,
        status: { [Op.in]: ["pending", "processing"] },
      },
      transaction,
      lock: transaction.LOCK?.UPDATE,
    });
    if (activeJob) {
      throw new AppError(409, "MEDITATION_BUSY", "Meditation is currently being processed");
    }

    await staged.update(
      {
        stage: "library",
        title: metadata.title,
        description: metadata.description,
        visibility: metadata.visibility,
      },
      { transaction },
    );
    return staged as unknown as Meditation;
  });
}
