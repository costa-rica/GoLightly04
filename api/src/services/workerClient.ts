import { logger } from "../config/logger";
import { readApiEnv } from "../config/env";

export async function notifyWorker(
  meditationId: number,
  mode: "intake" | "requeue" = "intake",
): Promise<void> {
  const env = readApiEnv();

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(`${env.URL_WORKER_NODE}/process`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ meditationId, mode }),
      });

      if (!response.ok) {
        throw new Error(`Worker returned ${response.status}`);
      }

      return;
    } catch (error) {
      logger.warn("Worker notification failed", { meditationId, mode, attempt, error });
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 200));
      }
    }
  }
}
