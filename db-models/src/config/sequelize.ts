import { Sequelize } from "sequelize";
import { readDbModelsEnv } from "./env";

export type SequelizeRole = "boot" | "app";

export function createSequelize(options: { role: SequelizeRole }): Sequelize {
  const env = readDbModelsEnv();
  const username = options.role === "boot" ? env.PG_USER : env.PG_APP_ROLE;

  return new Sequelize(env.PG_DATABASE, username, env.PG_PASSWORD, {
    host: env.PG_HOST,
    port: env.PG_PORT,
    dialect: "postgres",
    logging: false,
    define: {
      freezeTableName: true,
      underscored: true,
      schema: env.PG_SCHEMA,
    },
    pool: env.PG_POOL_MAX
      ? {
          max: env.PG_POOL_MAX,
        }
      : undefined,
  });
}

let defaultSequelize: Sequelize | null = null;

export function getDefaultSequelize(): Sequelize {
  if (!defaultSequelize) {
    defaultSequelize = createSequelize({ role: "app" });
  }

  return defaultSequelize;
}
