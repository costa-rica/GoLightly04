import path from "path";
import { readApiEnv } from "../config/env";

export function getProjectResourcePath(...segments: string[]): string {
  const env = readApiEnv();
  return path.join(env.PATH_PROJECT_RESOURCES, ...segments);
}

export function getPrerecordedAudioPath(filename: string): string {
  return getProjectResourcePath("prerecorded_audio", filename);
}

export function getBackupsPath(...segments: string[]): string {
  return getProjectResourcePath("backups_db", ...segments);
}
