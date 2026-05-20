import fs from "node:fs";

import { normalizeNodeEnv, type RuntimeNodeEnv } from "@golightly/shared-types";
import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";

type RawEnv = Record<string, string | undefined>;

export type LoggerEnv = {
  NODE_ENV: RuntimeNodeEnv;
  NAME_APP: string;
  PATH_TO_LOGS: string;
  LOG_MAX_SIZE: number;
  LOG_MAX_FILES: number;
};

function failAndExit(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function readRequired(name: "NODE_ENV" | "NAME_APP" | "PATH_TO_LOGS", env: RawEnv): string {
  const value = env[name];
  if (!value) {
    return failAndExit(`Missing required env var: ${name}`);
  }

  return value;
}

function readPositiveNumber(
  name: "LOG_MAX_SIZE" | "LOG_MAX_FILES",
  env: RawEnv,
  fallback: number,
): number {
  const raw = env[name];
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return failAndExit(
      `Missing or invalid env var: ${name} (expected a positive number; got "${raw}")`,
    );
  }

  return parsed;
}

export function readLoggerEnv(env: RawEnv = process.env): LoggerEnv {
  const nodeEnvValue = readRequired("NODE_ENV", env);

  let nodeEnv: RuntimeNodeEnv;
  try {
    nodeEnv = normalizeNodeEnv(nodeEnvValue);
  } catch (error) {
    return failAndExit(error instanceof Error ? error.message : "Invalid NODE_ENV");
  }

  const nameApp = readRequired("NAME_APP", env);
  const pathToLogs = readRequired("PATH_TO_LOGS", env);

  return {
    NODE_ENV: nodeEnv,
    NAME_APP: nameApp,
    PATH_TO_LOGS: pathToLogs,
    LOG_MAX_SIZE: readPositiveNumber("LOG_MAX_SIZE", env, 5),
    LOG_MAX_FILES: readPositiveNumber("LOG_MAX_FILES", env, 5),
  };
}

export function buildLogger(env: LoggerEnv): winston.Logger {
  fs.mkdirSync(env.PATH_TO_LOGS, { recursive: true });

  const transports: winston.transport[] = [];
  const createFileTransport = () =>
    new DailyRotateFile({
      dirname: env.PATH_TO_LOGS,
      filename: `${env.NAME_APP}-%DATE%.log`,
      datePattern: "YYYY-MM-DD",
      maxSize: `${env.LOG_MAX_SIZE}m`,
      maxFiles: env.LOG_MAX_FILES,
      level: "info",
    });

  if (env.NODE_ENV === "development") {
    transports.push(
      new winston.transports.Console({
        level: "debug",
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.timestamp(),
          winston.format.printf(
            ({ level, message, timestamp }) =>
              `${timestamp} [${env.NAME_APP}] ${level}: ${message}`,
          ),
        ),
      }),
    );
  } else if (env.NODE_ENV === "testing") {
    transports.push(new winston.transports.Console({ level: "info" }), createFileTransport());
  } else {
    transports.push(createFileTransport());
  }

  return winston.createLogger({
    level: env.NODE_ENV === "development" ? "debug" : "info",
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json(),
    ),
    defaultMeta: { app: env.NAME_APP },
    transports,
  });
}

const logger = buildLogger(readLoggerEnv());

export default logger;
