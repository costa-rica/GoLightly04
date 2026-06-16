import {
  InferAttributes,
  InferCreationAttributes,
  Sequelize,
} from "sequelize";
import { createSequelize, getDefaultSequelize } from "./config/sequelize";
import { readDbModelsEnv } from "./config/env";
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

async function applyAdditiveSchemaUpdates(sequelize: Sequelize): Promise<void> {
  const schema = readDbModelsEnv().PG_SCHEMA.replace(/"/g, '""');
  const table = (tableName: string) => `"${schema}"."${tableName.replace(/"/g, '""')}"`;

  await sequelize.query(`
    ALTER TABLE ${table("users")}
      ADD COLUMN IF NOT EXISTS show_script_mode_for_creating_meditations BOOLEAN NOT NULL DEFAULT FALSE;
  `);

  await sequelize.query(`
    ALTER TABLE ${table("sound_files")}
      ADD COLUMN IF NOT EXISTS duration_seconds INTEGER NULL;
  `);

  await sequelize.query(`
    ALTER TABLE ${table("meditations")}
      ADD COLUMN IF NOT EXISTS source_mode VARCHAR(16) NOT NULL DEFAULT 'spreadsheet',
      ADD COLUMN IF NOT EXISTS script_source TEXT NULL,
      ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS duration_seconds INTEGER NULL,
      ADD COLUMN IF NOT EXISTS duration_seconds_talking INTEGER NULL,
      ADD COLUMN IF NOT EXISTS duration_seconds_pause INTEGER NULL,
      ADD COLUMN IF NOT EXISTS duration_seconds_sound INTEGER NULL;
  `);
}

export async function provisionDatabase(
  sequelize: Sequelize = getDefaultSequelize(),
): Promise<{ tables: string[] }> {
  await syncAll(sequelize);
  await applyAdditiveSchemaUpdates(sequelize);

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
