import winston from "winston";
import path from "path";

// Validate required environment variables
const requiredVars = ["NODE_ENV", "NAME_APP", "PATH_TO_LOGS"];
const missingVars = requiredVars.filter((varName) => !process.env[varName]);

if (missingVars.length > 0) {
  process.stderr.write(
    `[FATAL] Missing required environment variables: ${missingVars.join(", ")}\n`,
  );
  process.exit(1);
}

const NODE_ENV = process.env.NODE_ENV!;
const NAME_APP = process.env.NAME_APP!;
const PATH_TO_LOGS = process.env.PATH_TO_LOGS!;
const LOG_MAX_SIZE = parseInt(process.env.LOG_MAX_SIZE || "5", 10);
const LOG_MAX_FILES = parseInt(process.env.LOG_MAX_FILES || "5", 10);

// Convert megabytes to bytes for Winston
const maxSizeInBytes = LOG_MAX_SIZE * 1024 * 1024;

// Log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack }) => {
    if (stack) {
      return `${timestamp} [${level.toUpperCase()}]: ${message}\n${stack}`;
    }
    return `${timestamp} [${level.toUpperCase()}]: ${message}`;
  })
);

// Console format with colors
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.printf(({ timestamp, level, message, stack }) => {
    if (stack) {
      return `${timestamp} [${level}]: ${message}\n${stack}`;
    }
    return `${timestamp} [${level}]: ${message}`;
  })
);

// Determine log level based on environment
const getLogLevel = (): string => {
  switch (NODE_ENV) {
    case "development":
      return "debug";
    case "testing":
    case "production":
      return "info";
    default:
      return "info";
  }
};

// Create transports based on environment
const createTransports = (): winston.transport[] => {
  const transports: winston.transport[] = [];

  // Development: console only
  if (NODE_ENV === "development") {
    transports.push(
      new winston.transports.Console({
        format: consoleFormat,
      })
    );
  }

  // Testing: console + file
  if (NODE_ENV === "testing") {
    transports.push(
      new winston.transports.Console({
        format: consoleFormat,
      })
    );
    transports.push(
      new winston.transports.File({
        filename: path.join(PATH_TO_LOGS, `${NAME_APP}.log`),
        format: logFormat,
        maxsize: maxSizeInBytes,
        maxFiles: LOG_MAX_FILES,
        tailable: true,
      })
    );
  }

  // Production: file only
  if (NODE_ENV === "production") {
    transports.push(
      new winston.transports.File({
        filename: path.join(PATH_TO_LOGS, `${NAME_APP}.log`),
        format: logFormat,
        maxsize: maxSizeInBytes,
        maxFiles: LOG_MAX_FILES,
        tailable: true,
      })
    );
  }

  return transports;
};

// Create logger instance
const logger = winston.createLogger({
  level: getLogLevel(),
  transports: createTransports(),
  exitOnError: false,
});

export default logger;
