import ffprobeInstaller from "@ffprobe-installer/ffprobe";
import ffmpeg from "fluent-ffmpeg";

ffmpeg.setFfprobePath(ffprobeInstaller.path);

export function probeDurationSeconds(filePath: string): Promise<number | null> {
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
