import fs from "fs/promises";
import path from "path";

import { FileNameComponents, GeneratedAudioFile } from "../../types";
import logger from "../logger";

function generateTimestamp(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");

  return `${year}${month}${day}_${hours}${minutes}${seconds}`;
}

function generateDateFolderName(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}${month}${day}`;
}

function extractVoiceNamePart(voiceName: string): string {
  const firstSpaceIndex = voiceName.indexOf(" ");

  if (firstSpaceIndex === -1) {
    return voiceName.substring(0, 10);
  }

  return voiceName.substring(0, firstSpaceIndex);
}

function extractTextPart(text: string): string {
  return text.substring(0, 10).replace(/ /g, "_");
}

function generateFileNameComponents(
  voiceName: string,
  text: string,
): FileNameComponents {
  return {
    voiceNamePart: extractVoiceNamePart(voiceName),
    textPart: extractTextPart(text),
    timestamp: generateTimestamp(),
  };
}

function constructFileName(components: FileNameComponents): string {
  return `${components.voiceNamePart}_${components.textPart}_${components.timestamp}.mp3`;
}

export async function saveAudioFile(
  audioBuffer: Buffer,
  voiceName: string,
  text: string,
  outputDirectory: string,
): Promise<GeneratedAudioFile> {
  try {
    const dateFolderName = generateDateFolderName();
    const outputDir = path.join(outputDirectory, dateFolderName);

    logger.info(`Ensuring ElevenLabs output directory exists: ${outputDir}`);
    await fs.mkdir(outputDir, { recursive: true });

    const components = generateFileNameComponents(voiceName, text);
    const fileName = constructFileName(components);
    const filePath = path.join(outputDir, fileName);

    await fs.writeFile(filePath, audioBuffer);
    logger.info(`Audio file saved successfully: ${filePath}`);

    return {
      fileName,
      filePath,
      outputDirectory: outputDir,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error(`Error saving audio file: ${errorMessage}`);
    throw new Error(`Failed to save audio file: ${errorMessage}`);
  }
}
