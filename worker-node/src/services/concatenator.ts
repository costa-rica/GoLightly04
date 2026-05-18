import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";

import logger from "../config/logger";
import { getDb } from "../lib/db";
import {
  getMeditationAudioRoot,
  getPrerecordedAudioRoot,
} from "../lib/projectPaths";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

function getTodayFolder(now = new Date()) {
  return now.toISOString().slice(0, 10).replaceAll("-", "");
}

function normalizeAudio(input: string, output: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(input)
      .audioFrequency(44100)
      .audioChannels(1)
      .audioCodec("libmp3lame")
      .format("mp3")
      .on("end", resolve)
      .on("error", reject)
      .save(output);
  });
}

function createSilentSegment(seconds: number, output: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input("anullsrc=r=44100:cl=mono")
      .inputFormat("lavfi")
      .duration(seconds)
      .audioFrequency(44100)
      .audioChannels(1)
      .audioCodec("libmp3lame")
      .format("mp3")
      .on("end", resolve)
      .on("error", reject)
      .save(output);
  });
}

function concatFiles(inputs: string[], output: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const command = ffmpeg();
    for (const input of inputs) {
      command.input(input);
    }

    command
      .on("end", resolve)
      .on("error", reject)
      .mergeToFile(output, os.tmpdir());
  });
}

function probeDurationSeconds(filePath: string): Promise<number | null> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err: Error | null, data: { format?: { duration?: number | string } }) => {
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

export async function concatenateMeditation(meditationId: number) {
  const db = getDb();
  const meditation = await db.Meditation.findByPk(meditationId);
  if (!meditation) {
    throw new Error(`Meditation ${meditationId} not found`);
  }

  const jobs = await db.JobQueue.findAll({
    where: { meditationId },
    order: [["sequence", "ASC"]],
  });

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "golightly-worker-"));
  const normalizedFiles: string[] = [];

  try {
    for (const job of jobs) {
      const target = path.join(tempDir, `normalized-${job.id}.mp3`);
      const inputData =
        typeof job.inputData === "string"
          ? (JSON.parse(job.inputData) as Record<string, unknown>)
          : {};

      if (job.type === "text") {
        if (!job.filePath) {
          throw new Error(`Missing synthesized file for job ${job.id}`);
        }
        await normalizeAudio(job.filePath, target);
      } else if (job.type === "sound") {
        const soundPath = path.join(
          getPrerecordedAudioRoot(),
          String(inputData.sound_file ?? ""),
        );
        await normalizeAudio(soundPath, target);
      } else {
        await createSilentSegment(Number(inputData.pause_duration ?? 0), target);
      }

      normalizedFiles.push(target);
    }

    const outputFolder = path.join(getMeditationAudioRoot(), getTodayFolder());
    await fs.mkdir(outputFolder, { recursive: true });
    const filename = `meditation_${meditationId}.mp3`;
    const destination = path.join(outputFolder, filename);
    await concatFiles(normalizedFiles, destination);
    const durationSeconds = await probeDurationSeconds(destination);
    if (durationSeconds === null) {
      logger.warn(
        `ffprobe failed for meditation ${meditationId} at ${destination}; storing null duration`,
      );
    }

    await meditation.update({
      status: "complete",
      filename,
      filePath: destination,
      durationSeconds,
    });

    return destination;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown ffmpeg error";
    await meditation.update({
      status: "failed",
    });
    logger.error(`Failed to concatenate meditation ${meditationId}: ${message}`);
    throw error;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}
