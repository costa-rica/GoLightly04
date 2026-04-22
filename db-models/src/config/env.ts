export type DbModelsEnv = {
  PG_HOST: string;
  PG_PORT: number;
  PG_DATABASE: string;
  PG_USER: string;
  PG_SCHEMA: string;
  PG_APP_ROLE: string;
  PG_POOL_MAX?: number;
  PG_PASSWORD?: string;
};

function requireEnv(name: keyof Omit<DbModelsEnv, "PG_POOL_MAX" | "PG_PASSWORD">): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required Postgres env var: ${name}`);
  }

  return value;
}

export function readDbModelsEnv(): DbModelsEnv {
  const portRaw = requireEnv("PG_PORT");
  const poolRaw = process.env.PG_POOL_MAX;

  const port = Number(portRaw);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid PG_PORT value: ${portRaw}`);
  }

  let poolMax: number | undefined;
  if (poolRaw) {
    poolMax = Number(poolRaw);
    if (!Number.isInteger(poolMax) || poolMax <= 0) {
      throw new Error(`Invalid PG_POOL_MAX value: ${poolRaw}`);
    }
  }

  return {
    PG_HOST: requireEnv("PG_HOST"),
    PG_PORT: port,
    PG_DATABASE: requireEnv("PG_DATABASE"),
    PG_USER: requireEnv("PG_USER"),
    PG_SCHEMA: requireEnv("PG_SCHEMA"),
    PG_APP_ROLE: requireEnv("PG_APP_ROLE"),
    PG_POOL_MAX: poolMax,
    PG_PASSWORD: process.env.PG_PASSWORD || undefined,
  };
}
