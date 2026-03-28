import * as fs from "fs";
import * as path from "path";
import winston from "winston";

const NODE_ENV = process.env.NODE_ENV || "development";
const NAME_APP = process.env.NAME_APP || "GoLightly03WorkerNode";
const PATH_TO_LOGS = process.env.PATH_TO_LOGS || path.join(process.cwd(), "logs");
const LOG_MAX_SIZE = parseInt(process.env.LOG_MAX_SIZE || "5", 10) * 1024 * 1024;
const LOG_MAX_FILES = parseInt(process.env.LOG_MAX_FILES || "5", 10);

if (NODE_ENV !== "development" && !process.env.PATH_TO_LOGS) {
  process.stderr.write(
    "[WARN] PATH_TO_LOGS not set, defaulting to ./logs for worker-node\n",
  );
}

fs.mkdirSync(PATH_TO_LOGS, { recursive: true });

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack }) => {
    if (stack) {
      return `${timestamp} [${level}]: ${message}\n${stack}`;
    }
    return `${timestamp} [${level}]: ${message}`;
  })
);

// Configure transports based on NODE_ENV
const transports: winston.transport[] = [];

// Development mode: console only
if (NODE_ENV === "development") {
  transports.push(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        logFormat,
      ),
    }),
  );
}

// Testing mode: console AND file
if (NODE_ENV === "testing") {
  transports.push(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        logFormat,
      ),
    }),
    new winston.transports.File({
      filename: path.join(PATH_TO_LOGS, `${NAME_APP}.log`),
      format: logFormat,
      maxsize: LOG_MAX_SIZE,
      maxFiles: LOG_MAX_FILES,
    }),
  );
}

// Production mode: file only
if (NODE_ENV === "production") {
  transports.push(
    new winston.transports.File({
      filename: path.join(PATH_TO_LOGS, `${NAME_APP}.log`),
      format: logFormat,
      maxsize: LOG_MAX_SIZE,
      maxFiles: LOG_MAX_FILES,
    }),
  );
}

// Create logger instance
const logger = winston.createLogger({
  level: NODE_ENV === "development" ? "debug" : "info",
  transports,
  exitOnError: false,
});

// Export logger
export default logger;
