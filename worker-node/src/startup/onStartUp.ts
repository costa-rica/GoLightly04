import fs from "node:fs/promises";

import { getDb } from "../lib/db";
import {
  getDbReplenishPath,
  getElevenLabsAudioRoot,
  getMeditationAudioRoot,
  getPrerecordedAudioRoot,
} from "../lib/projectPaths";

export async function onStartUp() {
  getDb();
  await fs.mkdir(getElevenLabsAudioRoot(), { recursive: true });
  await fs.mkdir(getMeditationAudioRoot(), { recursive: true });
  await fs.mkdir(getPrerecordedAudioRoot(), { recursive: true });
  await fs.mkdir(getDbReplenishPath(), { recursive: true });
  await fs.access(getPrerecordedAudioRoot());
}
