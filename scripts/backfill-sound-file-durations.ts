import "dotenv/config";

import fs from "node:fs/promises";
import path from "node:path";

import ffprobeInstaller from "@ffprobe-installer/ffprobe";
import ffmpeg from "fluent-ffmpeg";
import {
  SoundFile,
  createSequelize,
  initializeModels,
} from "@golightly/db-models";

ffmpeg.setFfprobePath(ffprobeInstaller.path);

type Args = {
  apply: boolean;
  force: boolean;
  limit?: number;
};

type Summary = {
  scanned: number;
  updated: number;
  skippedMissingFile: number;
  skippedProbeFailed: number;
  skippedAlreadySet: number;
};

function parseArgs(argv: string[]): Args {
  const args: Args = { apply: false, force: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") {
      args.apply = true;
    } else if (arg === "--force") {
      args.force = true;
    } else if (arg === "--limit") {
      const raw = argv[index + 1];
      const limit = Number(raw);
      if (!Number.isInteger(limit) || limit <= 0) {
        throw new Error("--limit must be a positive integer");
      }
      args.limit = limit;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function getSoundFilePath(filename: string): string {
  const resourcesPath = process.env.PATH_PROJECT_RESOURCES;
  if (!resourcesPath) {
    throw new Error("PATH_PROJECT_RESOURCES must be set");
  }

  return path.join(resourcesPath, "prerecorded_audio", filename);
}

function probeDurationSeconds(filePath: string): Promise<number | null> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (error, data) => {
      if (error) {
        resolve(null);
        return;
      }

      const rawDuration = data?.format?.duration;
      const duration = typeof rawDuration === "number" ? rawDuration : Number(rawDuration);
      if (!Number.isFinite(duration) || duration <= 0) {
        resolve(null);
        return;
      }

      resolve(Math.round(duration));
    });
  });
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sequelize = createSequelize({ role: "app" });
  initializeModels(sequelize);

  const summary: Summary = {
    scanned: 0,
    updated: 0,
    skippedMissingFile: 0,
    skippedProbeFailed: 0,
    skippedAlreadySet: 0,
  };

  try {
    const soundFiles = await SoundFile.findAll({ order: [["id", "ASC"]] });

    for (const soundFile of soundFiles) {
      if (args.limit !== undefined && summary.scanned >= args.limit) {
        break;
      }

      if (
        soundFile.durationSeconds !== null &&
        soundFile.durationSeconds !== undefined &&
        !args.force
      ) {
        summary.skippedAlreadySet += 1;
        continue;
      }

      summary.scanned += 1;
      const filePath = getSoundFilePath(soundFile.filename);

      if (!(await fileExists(filePath))) {
        summary.skippedMissingFile += 1;
        console.warn(`sound file ${soundFile.id}: missing file ${filePath}`);
        continue;
      }

      const durationSeconds = await probeDurationSeconds(filePath);
      if (durationSeconds === null) {
        summary.skippedProbeFailed += 1;
        console.warn(`sound file ${soundFile.id}: ffprobe failed for ${filePath}`);
        continue;
      }

      const previous = soundFile.durationSeconds ?? null;
      if (args.apply) {
        await soundFile.update({ durationSeconds });
        summary.updated += 1;
        console.log(`sound file ${soundFile.id}: set ${durationSeconds} seconds (was ${previous})`);
      } else {
        console.log(`sound file ${soundFile.id}: would set ${durationSeconds} seconds (was ${previous})`);
      }
    }

    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await sequelize.close();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
