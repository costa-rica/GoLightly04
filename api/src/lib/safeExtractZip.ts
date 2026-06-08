import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import { pipeline } from "stream/promises";

import unzipper from "unzipper";

import { logger } from "../config/logger";

export function isEntryNameSafe(name: string): boolean {
  if (!name) return false;
  if (path.isAbsolute(name)) return false;
  if (/^[A-Za-z]:/.test(name)) return false;
  const segments = name.split("/");
  if (segments.some((segment) => segment === "..")) return false;
  return true;
}

export function isEntryAllowed(normalized: string): boolean {
  if (!normalized.includes("/")) {
    if (normalized === "manifest.json") return true;
    if (normalized.endsWith(".csv")) return true;
    return false;
  }

  if (normalized.startsWith("resources/") && normalized.length > "resources/".length) {
    return true;
  }

  return false;
}

export interface SafeExtractResult {
  csvFiles: string[];
  hasManifest: boolean;
  resourceCount: number;
  skippedEntries: string[];
}

export async function safeExtractZip(
  zipPath: string,
  destDir: string,
): Promise<SafeExtractResult> {
  const result: SafeExtractResult = {
    csvFiles: [],
    hasManifest: false,
    resourceCount: 0,
    skippedEntries: [],
  };

  const zipStream = fs.createReadStream(zipPath).pipe(
    unzipper.Parse({ forceStream: true }),
  );

  for await (const entry of zipStream) {
    const rawName = entry.path as string;
    const normalized = rawName.replace(/\\/g, "/");

    if (!isEntryNameSafe(normalized)) {
      logger.warn(`safeExtractZip: rejecting unsafe entry name "${rawName}"`);
      result.skippedEntries.push(rawName);
      entry.autodrain();
      continue;
    }

    if (!isEntryAllowed(normalized)) {
      logger.warn(`safeExtractZip: rejecting unexpected entry "${normalized}"`);
      result.skippedEntries.push(rawName);
      entry.autodrain();
      continue;
    }

    if (entry.type !== "File") {
      result.skippedEntries.push(rawName);
      entry.autodrain();
      continue;
    }

    const destPath = path.resolve(destDir, normalized);
    const resolvedDestDir = path.resolve(destDir);
    if (!destPath.startsWith(resolvedDestDir + path.sep) && destPath !== resolvedDestDir) {
      logger.warn(`safeExtractZip: resolved path escapes destDir - skipping "${normalized}"`);
      result.skippedEntries.push(rawName);
      entry.autodrain();
      continue;
    }

    await fsPromises.mkdir(path.dirname(destPath), { recursive: true });
    await pipeline(entry, fs.createWriteStream(destPath));

    if (normalized === "manifest.json") {
      result.hasManifest = true;
    } else if (normalized.endsWith(".csv")) {
      result.csvFiles.push(normalized);
    } else {
      result.resourceCount++;
    }
  }

  return result;
}
