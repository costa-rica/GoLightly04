import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "golightly-worker-tests-"));

process.env.NODE_ENV = "testing";
process.env.PORT = "4001";
process.env.NAME_APP = "worker-node-tests";
process.env.PATH_TO_LOGS = path.join(tmpRoot, "logs");
process.env.LOG_MAX_SIZE = "1m";
process.env.LOG_MAX_FILES = "3d";
process.env.PATH_PROJECT_RESOURCES = path.join(tmpRoot, "resources");
process.env.API_KEY_ELEVEN_LABS = "test-key";
process.env.DEFAULT_ELEVENLABS_VOICE_ID = "voice-test";
process.env.DEFAULT_ELEVENLABS_SPEED = "1";
process.env.PG_HOST = "localhost";
process.env.PG_PORT = "5432";
process.env.PG_DATABASE = "golightly_test";
process.env.PG_USER = "postgres";
process.env.PG_PASSWORD = "postgres";
