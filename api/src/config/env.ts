import { normalizeNodeEnv, type RuntimeNodeEnv } from "@golightly/shared-types";

export type ApiEnv = {
  NODE_ENV: RuntimeNodeEnv;
  NAME_APP: string;
  PATH_TO_LOGS: string;
  PORT: number;
  URL_BASE_WEBSITE: string;
  JWT_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  URL_WORKER_NODE: string;
  EMAIL_HOST: string;
  EMAIL_PORT: number;
  EMAIL_USER: string;
  EMAIL_PASSWORD: string;
  EMAIL_FROM: string;
  PATH_PROJECT_RESOURCES: string;
  ADMIN_EMAIL: string;
  ADMIN_EMAILS: string[];
  ADMIN_PASSWORD: string;
  LOG_MAX_SIZE: number;
  LOG_MAX_FILES: number;
};

function readString(name: keyof Omit<ApiEnv, "NODE_ENV" | "PORT" | "EMAIL_PORT" | "LOG_MAX_SIZE" | "LOG_MAX_FILES">): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }

  return value;
}

function readNumber(name: "PORT" | "EMAIL_PORT", fallback?: number): number {
  const raw = process.env[name];
  if (!raw) {
    if (fallback !== undefined) {
      return fallback;
    }
    throw new Error(`Missing required env var: ${name}`);
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid numeric env var: ${name}`);
  }

  return parsed;
}

function readOptionalNumber(name: "LOG_MAX_SIZE" | "LOG_MAX_FILES", fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid numeric env var: ${name}`);
  }

  return parsed;
}

export function readApiEnv(): ApiEnv {
  const adminEmails = readString("ADMIN_EMAIL")
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean)
    .filter((email, index, emails) =>
      emails.findIndex((item) => item.toLowerCase() === email.toLowerCase()) === index,
    );
  if (adminEmails.length === 0) {
    throw new Error("ADMIN_EMAIL must include at least one email");
  }

  return {
    NODE_ENV: normalizeNodeEnv(process.env.NODE_ENV),
    NAME_APP: readString("NAME_APP"),
    PATH_TO_LOGS: readString("PATH_TO_LOGS"),
    PORT: readNumber("PORT", 3000),
    URL_BASE_WEBSITE: readString("URL_BASE_WEBSITE"),
    JWT_SECRET: readString("JWT_SECRET"),
    GOOGLE_CLIENT_ID: readString("GOOGLE_CLIENT_ID"),
    URL_WORKER_NODE: readString("URL_WORKER_NODE"),
    EMAIL_HOST: readString("EMAIL_HOST"),
    EMAIL_PORT: readNumber("EMAIL_PORT", 587),
    EMAIL_USER: readString("EMAIL_USER"),
    EMAIL_PASSWORD: readString("EMAIL_PASSWORD"),
    EMAIL_FROM: readString("EMAIL_FROM"),
    PATH_PROJECT_RESOURCES: readString("PATH_PROJECT_RESOURCES"),
    ADMIN_EMAIL: adminEmails.join(","),
    ADMIN_EMAILS: adminEmails,
    ADMIN_PASSWORD: readString("ADMIN_PASSWORD"),
    LOG_MAX_SIZE: readOptionalNumber("LOG_MAX_SIZE", 5),
    LOG_MAX_FILES: readOptionalNumber("LOG_MAX_FILES", 5),
  };
}
