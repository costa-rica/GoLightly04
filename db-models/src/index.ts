import {
  InferAttributes,
  InferCreationAttributes,
  Sequelize,
} from "sequelize";
import { createSequelize, getDefaultSequelize } from "./config/sequelize";
import { initializeModels } from "./models/associations";
import { ContractUserMeditation } from "./models/ContractUserMeditation";
import { JobQueue } from "./models/JobQueue";
import { Meditation } from "./models/Meditation";
import { SoundFile } from "./models/SoundFile";
import { User } from "./models/User";

export { createSequelize, getDefaultSequelize, initializeModels };
export { User, SoundFile, Meditation, JobQueue, ContractUserMeditation };
export type { InferAttributes, InferCreationAttributes };

export async function syncAll(sequelize: Sequelize = getDefaultSequelize()): Promise<Sequelize> {
  initializeModels(sequelize);
  await sequelize.sync();
  return sequelize;
}

export async function provisionDatabase(
  sequelize: Sequelize = getDefaultSequelize(),
): Promise<{ tables: string[] }> {
  await syncAll(sequelize);

  return {
    tables: [
      User.tableName,
      SoundFile.tableName,
      Meditation.tableName,
      JobQueue.tableName,
      ContractUserMeditation.tableName,
    ].map((tableName) => String(tableName)),
  };
}
