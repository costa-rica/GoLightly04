import "dotenv/config";

import fs from "node:fs/promises";
import path from "node:path";

import ffprobeInstaller from "@ffprobe-installer/ffprobe";
import ffmpeg from "fluent-ffmpeg";
import {
  JobQueue,
  Meditation,
  createSequelize,
  initializeModels,
} from "@golightly/db-models";

ffmpeg.setFfprobePath(ffprobeInstaller.path);

type Args = {
  apply: boolean;
  force: boolean;
  help: boolean;
  limit?: number;
};

type Category = "talking" | "sound";

type CategoryCounts = Record<Category, number>;

type SegmentDurations = {
  durationSecondsTalking: number | null;
  durationSecondsPause: number;
  durationSecondsSound: number | null;
};

type Result = SegmentDurations & {
  meditationId: number;
  applied: boolean;
  previous: {
    durationSecondsTalking: number | null;
    durationSecondsPause: number | null;
    durationSecondsSound: number | null;
  };
};

type Summary = {
  apply: boolean;
  force: boolean;
  limit: number | null;
  scanned: number;
  processed: number;
  updated: number;
  skippedAlreadySet: number;
  skippedNoJobs: number;
  skippedMissingFile: CategoryCounts;
  skippedProbeFailed: CategoryCounts;
  results: Result[];
};

function parseArgs(argv: string[]): Args {
  const args: Args = { apply: false, force: false, help: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") {
      args.apply = true;
    } else if (arg === "--force") {
      args.force = true;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
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

function printHelp() {
  console.log(`Usage: npm run backfill:segment-durations -- [options]

Options:
  --apply       Write computed segment durations to meditations
  --force       Recompute rows where all segment durations are already set
  --limit <n>   Process at most n eligible complete meditations
  --help, -h    Show this help text
`);
}

function getPrerecordedAudioPath(filename: string): string {
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

function parseInputData(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

async function probeSegment(
  meditationId: number,
  category: Category,
  filePath: string,
  summary: Summary,
): Promise<number | null> {
  if (!(await fileExists(filePath))) {
    summary.skippedMissingFile[category] += 1;
    console.warn(`meditation ${meditationId}: missing ${category} file ${filePath}`);
    return null;
  }

  const durationSeconds = await probeDurationSeconds(filePath);
  if (durationSeconds === null) {
    summary.skippedProbeFailed[category] += 1;
    console.warn(`meditation ${meditationId}: ffprobe failed for ${category} file ${filePath}`);
    return null;
  }

  return durationSeconds;
}

async function computeDurations(meditationId: number, summary: Summary): Promise<SegmentDurations | null> {
  const jobs = await JobQueue.findAll({
    where: { meditationId },
    order: [["sequence", "ASC"]],
  });

  if (jobs.length === 0) {
    summary.skippedNoJobs += 1;
    console.warn(`meditation ${meditationId}: no jobs_queue rows found`);
    return null;
  }

  let talkingTotal = 0;
  let talkingComplete = true;
  let pauseTotal = 0;
  let soundTotal = 0;
  let soundComplete = true;

  for (const job of jobs) {
    const inputData = parseInputData(job.inputData);

    if (job.type === "text") {
      if (!job.filePath) {
        summary.skippedMissingFile.talking += 1;
        talkingComplete = false;
        console.warn(`meditation ${meditationId}: text job ${job.id} has no file path`);
        continue;
      }

      const durationSeconds = await probeSegment(meditationId, "talking", job.filePath, summary);
      if (durationSeconds === null) {
        talkingComplete = false;
      } else {
        talkingTotal += durationSeconds;
      }
    } else if (job.type === "pause") {
      pauseTotal += Math.round(Number(inputData.pause_duration ?? 0));
    } else if (job.type === "sound") {
      const soundFile = String(inputData.sound_file ?? "");
      const durationSeconds = await probeSegment(
        meditationId,
        "sound",
        getPrerecordedAudioPath(soundFile),
        summary,
      );
      if (durationSeconds === null) {
        soundComplete = false;
      } else {
        soundTotal += durationSeconds;
      }
    }
  }

  return {
    durationSecondsTalking: talkingComplete ? talkingTotal : null,
    durationSecondsPause: pauseTotal,
    durationSecondsSound: soundComplete ? soundTotal : null,
  };
}

function isAlreadyPopulated(meditation: Meditation): boolean {
  return (
    meditation.durationSecondsTalking !== null &&
    meditation.durationSecondsTalking !== undefined &&
    meditation.durationSecondsPause !== null &&
    meditation.durationSecondsPause !== undefined &&
    meditation.durationSecondsSound !== null &&
    meditation.durationSecondsSound !== undefined
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const sequelize = createSequelize({ role: "app" });
  initializeModels(sequelize);

  const summary: Summary = {
    apply: args.apply,
    force: args.force,
    limit: args.limit ?? null,
    scanned: 0,
    processed: 0,
    updated: 0,
    skippedAlreadySet: 0,
    skippedNoJobs: 0,
    skippedMissingFile: { talking: 0, sound: 0 },
    skippedProbeFailed: { talking: 0, sound: 0 },
    results: [],
  };

  try {
    const meditations = await Meditation.findAll({
      where: { status: "complete" },
      order: [["id", "ASC"]],
    });

    for (const meditation of meditations) {
      if (args.limit !== undefined && summary.processed >= args.limit) {
        break;
      }

      summary.scanned += 1;

      if (isAlreadyPopulated(meditation) && !args.force) {
        summary.skippedAlreadySet += 1;
        continue;
      }

      const durations = await computeDurations(meditation.id, summary);
      if (!durations) {
        continue;
      }

      summary.processed += 1;
      const result: Result = {
        meditationId: meditation.id,
        applied: args.apply,
        previous: {
          durationSecondsTalking: meditation.durationSecondsTalking ?? null,
          durationSecondsPause: meditation.durationSecondsPause ?? null,
          durationSecondsSound: meditation.durationSecondsSound ?? null,
        },
        ...durations,
      };
      summary.results.push(result);

      if (args.apply) {
        await meditation.update(durations);
        summary.updated += 1;
        console.log(`meditation ${meditation.id}: set segment durations`);
      } else {
        console.log(`meditation ${meditation.id}: would set segment durations`);
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
