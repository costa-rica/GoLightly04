import fs from "fs";
import os from "os";
import path from "path";

export const applyApiTestEnv = (): void => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "golightly03-api-"));
  const logsDir = path.join(baseDir, "logs");
  const resourcesDir = path.join(baseDir, "resources");
  const outputDir = path.join(baseDir, "output");
  const soundFilesDir = path.join(baseDir, "sound-files");
  const databaseDir = path.join(baseDir, "db");

  fs.mkdirSync(logsDir, { recursive: true });
  fs.mkdirSync(resourcesDir, { recursive: true });
  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(soundFilesDir, { recursive: true });
  fs.mkdirSync(databaseDir, { recursive: true });

  process.env.NODE_ENV = "testing";
  process.env.NAME_APP = "GoLightly03API";
  process.env.PATH_TO_LOGS = logsDir;
  process.env.LOG_MAX_SIZE = "5";
  process.env.LOG_MAX_FILES = "5";
  process.env.PORT = "3000";
  process.env.JWT_SECRET = "test-secret";
  process.env.GOOGLE_CLIENT_ID = "test-google-client-id";
  process.env.PATH_MP3_OUTPUT = outputDir;
  process.env.PATH_MP3_SOUND_FILES = soundFilesDir;
  process.env.URL_MANTRIFY01QUEUER = "http://localhost:3002";
  process.env.PATH_PROJECT_RESOURCES = resourcesDir;
  process.env.URL_BASE_WEBSITE = "http://localhost:3001";
  process.env.EMAIL_HOST = "smtp.example.com";
  process.env.EMAIL_PORT = "587";
  process.env.EMAIL_USER = "test@example.com";
  process.env.EMAIL_PASSWORD = "password";
  process.env.EMAIL_FROM = "GoLightly <test@example.com>";
  process.env.PATH_DATABASE = databaseDir;
  process.env.NAME_DB = "api-test.sqlite";
};
