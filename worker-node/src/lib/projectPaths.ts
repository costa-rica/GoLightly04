import path from "node:path";

import { loadEnv } from "../config/env";

function getRoot() {
  return loadEnv().PATH_PROJECT_RESOURCES;
}

export function getElevenLabsAudioRoot() {
  return path.join(getRoot(), "eleven_labs_audio_files");
}

export function getMeditationAudioRoot() {
  return path.join(getRoot(), "meditation_soundfiles");
}

export function getPrerecordedAudioRoot() {
  return path.join(getRoot(), "prerecorded_audio");
}

export function getBackupsPath(...segments: string[]) {
  return path.join(getRoot(), "db_backups", ...segments);
}

export function getFullBackupsPath(...segments: string[]): string {
  return path.join(getRoot(), "db_backups_and_data", ...segments);
}

export function getDbReplenishPath(...segments: string[]): string {
  return path.join(getRoot(), "db_replenish", ...segments);
}
