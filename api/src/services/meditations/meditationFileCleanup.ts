import fs from "fs/promises";
import path from "path";
import { getProjectResourcePath } from "../../lib/projectPaths";

async function deleteMatchingFiles(rootDir: string, matcher: (filename: string) => boolean): Promise<void> {
  try {
    const subdirs = await fs.readdir(rootDir, { withFileTypes: true });
    await Promise.all(
      subdirs.map(async (entry) => {
        const entryPath = path.join(rootDir, entry.name);
        if (entry.isDirectory()) {
          const files = await fs.readdir(entryPath);
          await Promise.all(
            files.filter(matcher).map(async (file) => {
              await fs.rm(path.join(entryPath, file), { force: true });
            }),
          );
        } else if (matcher(entry.name)) {
          await fs.rm(entryPath, { force: true });
        }
      }),
    );
  } catch {
    // Best-effort filesystem cleanup.
  }
}

export async function deleteMeditationAudioFiles(meditationId: number): Promise<void> {
  await deleteMatchingFiles(
    getProjectResourcePath("eleven_labs_audio_files"),
    (filename) => filename.startsWith(`el_${meditationId}_`) && filename.endsWith(".mp3"),
  );
  await deleteMatchingFiles(
    getProjectResourcePath("meditation_soundfiles"),
    (filename) => filename === `meditation_${meditationId}.mp3`,
  );
}
