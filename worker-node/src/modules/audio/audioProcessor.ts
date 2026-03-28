import { execSync } from "child_process";
import fs from "fs";
import path from "path";

import ffmpeg from "fluent-ffmpeg";

import logger from "../logger";
import { AudioProcessingResult, AudioSequenceStep } from "../../types";

let configuredFfmpegPath: string | null = null;

function resolveFfmpegPath(): string {
  if (configuredFfmpegPath) {
    return configuredFfmpegPath;
  }

  try {
    const ffmpegPath = execSync("which ffmpeg", { encoding: "utf-8" }).trim();
    if (ffmpegPath && fs.existsSync(ffmpegPath)) {
      configuredFfmpegPath = ffmpegPath;
      ffmpeg.setFfmpegPath(ffmpegPath);
      logger.info(`Using FFmpeg at: ${ffmpegPath}`);
      return ffmpegPath;
    }
  } catch {
    logger.warn("Could not find ffmpeg using 'which', trying common paths");
  }

  const commonPaths = [
    "/opt/homebrew/bin/ffmpeg",
    "/usr/local/bin/ffmpeg",
    "/usr/bin/ffmpeg",
  ];

  for (const ffmpegPath of commonPaths) {
    if (fs.existsSync(ffmpegPath)) {
      configuredFfmpegPath = ffmpegPath;
      ffmpeg.setFfmpegPath(ffmpegPath);
      logger.info(`Using FFmpeg at: ${ffmpegPath}`);
      return ffmpegPath;
    }
  }

  throw new Error("FFmpeg not found");
}

export function ensureFfmpegAvailable(): string {
  return resolveFfmpegPath();
}

async function generateSilence(
  durationSeconds: number,
  outputPath: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const ffmpegPath = resolveFfmpegPath();
      const cmd = `${ffmpegPath} -f lavfi -i anullsrc=r=44100:cl=stereo -t ${durationSeconds} -c:a libmp3lame -b:a 128k -y "${outputPath}"`;
      execSync(cmd, { stdio: "pipe" });

      if (!fs.existsSync(outputPath)) {
        throw new Error("Output file was not created");
      }

      resolve();
    } catch (error) {
      reject(error);
    }
  });
}

async function getAudioDuration(filePath: string): Promise<number> {
  resolveFfmpegPath();

  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        reject(err);
        return;
      }

      resolve(metadata.format.duration || 0);
    });
  });
}

export async function combineAudioFiles(
  steps: AudioSequenceStep[],
  outputPath: string,
  projectResourcesPath: string,
): Promise<AudioProcessingResult> {
  resolveFfmpegPath();
  const tempDir = path.join(projectResourcesPath, "temporary_deletable");
  const concatListPath = path.join(tempDir, "concat-list.txt");

  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  try {
    const filesToConcat: string[] = [];

    for (let i = 0; i < steps.length; i += 1) {
      const step = steps[i];

      if (step.audio_file_name_and_path) {
        filesToConcat.push(step.audio_file_name_and_path);
      } else if (
        step.pause_duration !== undefined &&
        step.pause_duration > 0
      ) {
        const silenceFile = path.join(tempDir, `silence-${i}.mp3`);
        await generateSilence(step.pause_duration, silenceFile);
        filesToConcat.push(silenceFile);
      }
    }

    if (filesToConcat.length === 0) {
      throw new Error("No audio files or pauses to process");
    }

    const concatListContent = filesToConcat
      .map((file) => `file '${file.replace(/'/g, "'\\''")}'`)
      .join("\n");

    fs.writeFileSync(concatListPath, concatListContent);

    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(concatListPath)
        .inputOptions(["-f", "concat", "-safe", "0"])
        .audioCodec("libmp3lame")
        .audioBitrate("128k")
        .audioFrequency(44100)
        .audioChannels(2)
        .output(outputPath)
        .on("end", () => resolve())
        .on("error", (err) => reject(err))
        .run();
    });

    const audioLengthSeconds = await getAudioDuration(outputPath);

    return {
      outputPath,
      audioLengthSeconds,
    };
  } finally {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
}
