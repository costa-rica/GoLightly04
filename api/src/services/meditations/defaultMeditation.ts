import type { Transaction } from "sequelize";
import { getDb } from "../../lib/db";
import { AppError } from "../../lib/errors";

export async function getDefaultMeditation() {
  const { Meditation } = getDb();
  const meditation = await Meditation.findOne({
    where: { isDefault: true },
    order: [["updatedAt", "DESC"]],
  });
  if (!meditation) {
    throw new AppError(404, "NO_DEFAULT_MEDITATION", "No default meditation has been selected");
  }
  return meditation;
}

export async function setDefaultMeditation(id: number) {
  const { sequelize, Meditation } = getDb();
  return sequelize.transaction(async (transaction: Transaction) => {
    const meditation = await Meditation.findByPk(id, { transaction });
    if (!meditation) {
      throw new AppError(404, "NOT_FOUND", "Meditation not found");
    }

    await Meditation.update({ isDefault: false }, { where: {}, transaction });
    meditation.isDefault = true;
    await meditation.save({ transaction });
    return meditation;
  });
}
