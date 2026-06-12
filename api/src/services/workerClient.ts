import { logger } from "../config/logger";
import { readApiEnv } from "../config/env";

export class WorkerConflictError extends Error {
  readonly status: number;
  readonly responseBody: string;

  constructor(message: string, options: { status?: number; responseBody?: string } = {}) {
    super(message);
    this.name = "WorkerConflictError";
    this.status = options.status ?? 409;
    this.responseBody = options.responseBody ?? "";
  }
}

async function readWorkerError(response: Response): Promise<string> {
  try {
    const body = await response.text();
    return body;
  } catch {
    return "";
  }
}

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

      if (response.status === 409) {
        const responseBody = await readWorkerError(response);
        throw new WorkerConflictError("Worker refused processing request", {
          responseBody,
        });
      }

      if (!response.ok) {
        throw new Error(`Worker returned ${response.status}`);
      }

      return;
    } catch (error) {
      if (error instanceof WorkerConflictError) {
        throw error;
      }
      logger.warn("Worker notification failed", { meditationId, mode, attempt, error });
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 200));
      }
    }
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
        const responseBody = await readWorkerError(response);
        throw new WorkerConflictError("A backup job is already running on the worker", {
          responseBody,
        });
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

export async function requestWorkerReplenish(payload: {
  filename: string;
}): Promise<void> {
  const env = readApiEnv();
  let lastError: unknown;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(`${env.URL_WORKER_NODE}/replenish`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (response.status === 409) {
        const responseBody = await readWorkerError(response);
        throw new WorkerConflictError("A replenish job is already running on the worker", {
          responseBody,
        });
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
      logger.warn("Worker replenish request failed", { attempt, error });
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
