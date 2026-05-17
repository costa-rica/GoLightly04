import { getDb } from "../../lib/db";
import { deleteMeditationAudioFiles } from "./meditationFileCleanup";

export async function deleteMeditationCascade(meditationId: number): Promise<void> {
  const { sequelize, ContractUserMeditation, JobQueue, Meditation } = getDb();

  await sequelize.transaction(async (transaction) => {
    await JobQueue.destroy({ where: { meditationId }, transaction });
    await ContractUserMeditation.destroy({ where: { meditationId }, transaction });
    await Meditation.destroy({ where: { id: meditationId }, transaction });
  });

  await deleteMeditationAudioFiles(meditationId);
}
