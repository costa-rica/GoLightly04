import fs from "fs";
import path from "path";
import { createLogger, format, transports, type Logger } from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import { normalizeNodeEnv } from "./env";

export type LoggerEnv = {
  NODE_ENV: "development" | "testing" | "production";
  NAME_APP: string;
  PATH_TO_LOGS: string;
  LOG_MAX_SIZE: number;
  LOG_MAX_FILES: number;
};

function failAndExit(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

export function readLoggerEnv(env = process.env): LoggerEnv {
  const nodeEnvValue = env.NODE_ENV;
  const nameApp = env.NAME_APP;
  const pathToLogs = env.PATH_TO_LOGS;

  if (!nodeEnvValue) {
    return failAndExit("Missing required env var: NODE_ENV");
  }
  if (!nameApp) {
    return failAndExit("Missing required env var: NAME_APP");
  }
  if (!pathToLogs) {
    return failAndExit("Missing required env var: PATH_TO_LOGS");
  }

  const nodeEnv = normalizeNodeEnv(nodeEnvValue);
  const logMaxSize = Number(env.LOG_MAX_SIZE ?? "5");
  const logMaxFiles = Number(env.LOG_MAX_FILES ?? "5");

  fs.mkdirSync(pathToLogs, { recursive: true });

  return {
    NODE_ENV: nodeEnv,
    NAME_APP: nameApp,
    PATH_TO_LOGS: pathToLogs,
    LOG_MAX_SIZE: Number.isFinite(logMaxSize) ? logMaxSize : 5,
    LOG_MAX_FILES: Number.isFinite(logMaxFiles) ? logMaxFiles : 5,
  };
}

export function buildLogger(loggerEnv: LoggerEnv): Logger {
  const sharedFormat = format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.splat(),
    format.json(),
  );

  const loggerTransports: Array<transports.ConsoleTransportInstance | DailyRotateFile> = [];
  const fileTransport = new DailyRotateFile({
    dirname: loggerEnv.PATH_TO_LOGS,
    filename: `${loggerEnv.NAME_APP}-%DATE%.log`,
    datePattern: "YYYY-MM-DD",
    maxSize: `${loggerEnv.LOG_MAX_SIZE}m`,
    maxFiles: loggerEnv.LOG_MAX_FILES,
  });

  if (loggerEnv.NODE_ENV === "development") {
    loggerTransports.push(new transports.Console());
  } else if (loggerEnv.NODE_ENV === "testing") {
    loggerTransports.push(new transports.Console(), fileTransport);
  } else {
    loggerTransports.push(fileTransport);
  }

  return createLogger({
    level: loggerEnv.NODE_ENV === "development" ? "debug" : "info",
    format: sharedFormat,
    defaultMeta: { app: loggerEnv.NAME_APP },
    transports: loggerTransports,
  });
}

export const logger = buildLogger(readLoggerEnv());
