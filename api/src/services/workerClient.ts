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

export class WorkerConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkerConflictError";
  }
}

export async function requestWorkerBackup(payload: {
  includeResources: boolean;
}): Promise<void> {
  const env = readApiEnv();
  let lastError: unknown;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(`${env.URL_WORKER_NODE}/backup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (response.status === 409) {
        throw new WorkerConflictError("A backup job is already running on the worker");
      }

      if (response.ok) {
        return;
      }

      throw new Error(`Worker returned unexpected status ${response.status}`);
    } catch (error) {
      if (error instanceof WorkerConflictError) {
        throw error;
      }
      lastError = error;
      logger.warn("Worker backup request failed", { attempt, error });
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 200));
      }
    }
  }

  throw new Error(
    `Worker unreachable after 3 attempts: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}
