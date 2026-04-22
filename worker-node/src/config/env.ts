type RawEnv = Record<string, string | undefined>;

export interface WorkerEnv {
  NODE_ENV: string;
  PORT: number;
  NAME_APP: string;
  PATH_TO_LOGS: string;
  LOG_MAX_SIZE: string;
  LOG_MAX_FILES: string;
  PATH_PROJECT_RESOURCES: string;
  API_KEY_ELEVEN_LABS: string;
  DEFAULT_ELEVENLABS_VOICE_ID: string;
  DEFAULT_ELEVENLABS_SPEED: number;
}

const REQUIRED = [
  "NODE_ENV",
  "NAME_APP",
  "PATH_TO_LOGS",
  "PATH_PROJECT_RESOURCES",
  "API_KEY_ELEVEN_LABS",
  "DEFAULT_ELEVENLABS_VOICE_ID",
] as const;

function requireEnv(name: (typeof REQUIRED)[number], env: RawEnv): string {
  const value = env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }

  return value;
}

export function loadEnv(env: RawEnv = process.env): WorkerEnv {
  const loaded = {
    NODE_ENV: requireEnv("NODE_ENV", env),
    PORT: Number(env.PORT ?? 4001),
    NAME_APP: requireEnv("NAME_APP", env),
    PATH_TO_LOGS: requireEnv("PATH_TO_LOGS", env),
    LOG_MAX_SIZE: env.LOG_MAX_SIZE ?? "10m",
    LOG_MAX_FILES: env.LOG_MAX_FILES ?? "14d",
    PATH_PROJECT_RESOURCES: requireEnv("PATH_PROJECT_RESOURCES", env),
    API_KEY_ELEVEN_LABS: requireEnv("API_KEY_ELEVEN_LABS", env),
    DEFAULT_ELEVENLABS_VOICE_ID: requireEnv("DEFAULT_ELEVENLABS_VOICE_ID", env),
    DEFAULT_ELEVENLABS_SPEED: Number(env.DEFAULT_ELEVENLABS_SPEED ?? 1),
  };

  if (Number.isNaN(loaded.PORT)) {
    throw new Error("PORT must be a number");
  }

  if (Number.isNaN(loaded.DEFAULT_ELEVENLABS_SPEED)) {
    throw new Error("DEFAULT_ELEVENLABS_SPEED must be a number");
  }

  return loaded;
}
