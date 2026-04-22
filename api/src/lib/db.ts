import {
  ContractUserMeditation,
  getDefaultSequelize,
  initializeModels,
  JobQueue,
  Meditation,
  SoundFile,
  User,
} from "@golightly/db-models";

export function getDb() {
  const sequelize = getDefaultSequelize();
  initializeModels(sequelize);

  return {
    sequelize,
    User,
    SoundFile,
    Meditation,
    JobQueue,
    ContractUserMeditation,
  };
}
