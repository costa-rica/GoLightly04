import "dotenv/config";

import fs from "node:fs/promises";

import ffmpeg from "fluent-ffmpeg";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";
import {
  Meditation,
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

function probeDurationSeconds(filePath: string): Promise<number | null> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) {
        resolve(null);
        return;
      }

      const raw = data?.format?.duration;
      const duration = typeof raw === "number" ? raw : Number(raw);
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
    const meditations = await Meditation.findAll({
      where: { status: "complete" },
      order: [["id", "ASC"]],
    });

    for (const meditation of meditations) {
      if (args.limit !== undefined && summary.scanned >= args.limit) {
        break;
      }

      if (!meditation.filePath) {
        continue;
      }

      if (meditation.durationSeconds !== null && meditation.durationSeconds !== undefined && !args.force) {
        summary.skippedAlreadySet += 1;
        continue;
      }

      summary.scanned += 1;

      if (!(await fileExists(meditation.filePath))) {
        summary.skippedMissingFile += 1;
        console.warn(`meditation ${meditation.id}: missing file ${meditation.filePath}`);
        continue;
      }

      const durationSeconds = await probeDurationSeconds(meditation.filePath);
      if (durationSeconds === null) {
        summary.skippedProbeFailed += 1;
        console.warn(`meditation ${meditation.id}: ffprobe failed for ${meditation.filePath}`);
        continue;
      }

      const previous = meditation.durationSeconds ?? null;
      if (args.apply) {
        await meditation.update({ durationSeconds });
        summary.updated += 1;
        console.log(`meditation ${meditation.id}: set ${durationSeconds} seconds (was ${previous})`);
      } else {
        console.log(`meditation ${meditation.id}: would set ${durationSeconds} seconds (was ${previous})`);
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
