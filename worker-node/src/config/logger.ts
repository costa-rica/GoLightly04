import fs from "node:fs";
import path from "node:path";

import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";

import { loadEnv } from "./env";

function createLogger() {
  const env = loadEnv();
  fs.mkdirSync(env.PATH_TO_LOGS, { recursive: true });

  const transports: winston.transport[] = [];

  if (env.NODE_ENV === "development" || env.NODE_ENV === "testing") {
    transports.push(
      new winston.transports.Console({
        level: env.NODE_ENV === "testing" ? "error" : "debug",
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
  } else {
    transports.push(
      new DailyRotateFile({
        dirname: env.PATH_TO_LOGS,
        filename: path.join("%DATE%-worker.log"),
        datePattern: "YYYY-MM-DD",
        maxSize: env.LOG_MAX_SIZE,
        maxFiles: env.LOG_MAX_FILES,
        level: "info",
      }),
    );
    transports.push(
      new DailyRotateFile({
        dirname: env.PATH_TO_LOGS,
        filename: path.join("%DATE%-worker-error.log"),
        datePattern: "YYYY-MM-DD",
        maxSize: env.LOG_MAX_SIZE,
        maxFiles: env.LOG_MAX_FILES,
        level: "error",
      }),
    );
  }

  return winston.createLogger({
    level: env.NODE_ENV === "development" ? "debug" : "info",
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json(),
    ),
    defaultMeta: { service: env.NAME_APP },
    transports,
  });
}

let loggerInstance: winston.Logger | null = null;

export function getLogger() {
  if (!loggerInstance) {
    loggerInstance = createLogger();
  }

  return loggerInstance;
}

const logger = getLogger();

export default logger;
