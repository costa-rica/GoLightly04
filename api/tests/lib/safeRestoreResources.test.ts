import fs from "fs/promises";
import os from "os";
import path from "path";

import { safeRestoreResources } from "../../src/lib/safeRestoreResources";
import { logger } from "../../src/config/logger";

describe("safeRestoreResources", () => {
  let tempDir: string;
  let destRoot: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "golightly-safe-restore-src-"));
    destRoot = await fs.mkdtemp(path.join(os.tmpdir(), "golightly-safe-restore-dest-"));
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await fs.rm(tempDir, { recursive: true, force: true });
    await fs.rm(destRoot, { recursive: true, force: true });
  });

  it("returns 0 when resources dir is missing", async () => {
    await expect(safeRestoreResources(tempDir, destRoot)).resolves.toBe(0);
    await expect(fs.readdir(destRoot)).resolves.toEqual([]);
  });

  it("copies regular files and returns the restored file count", async () => {
    await fs.mkdir(path.join(tempDir, "resources", "subdir"), { recursive: true });
    await fs.writeFile(path.join(tempDir, "resources", "a.txt"), "a");
    await fs.writeFile(path.join(tempDir, "resources", "subdir", "b.txt"), "b");
    await fs.writeFile(path.join(tempDir, "resources", "subdir", "c.txt"), "c");

    await expect(safeRestoreResources(tempDir, destRoot)).resolves.toBe(3);

    await expect(fs.readFile(path.join(destRoot, "a.txt"), "utf8")).resolves.toBe("a");
    await expect(fs.readFile(path.join(destRoot, "subdir", "b.txt"), "utf8")).resolves.toBe("b");
    await expect(fs.readFile(path.join(destRoot, "subdir", "c.txt"), "utf8")).resolves.toBe("c");
  });

  it("skips symlinks without copying their targets", async () => {
    const warnSpy = jest.spyOn(logger, "warn");
    const outside = path.join(tempDir, "outside.txt");
    await fs.writeFile(outside, "outside");
    await fs.mkdir(path.join(tempDir, "resources"), { recursive: true });
    await fs.symlink(outside, path.join(tempDir, "resources", "link.txt"));

    await expect(safeRestoreResources(tempDir, destRoot)).resolves.toBe(0);

    await expect(fs.access(path.join(destRoot, "link.txt"))).rejects.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("skipping symlink"));
  });

  it("uses the symlink guard to block traversal-style escaped sources", async () => {
    const warnSpy = jest.spyOn(logger, "warn");
    const outside = path.join(tempDir, "outside-traversal.txt");
    await fs.writeFile(outside, "outside");
    await fs.mkdir(path.join(tempDir, "resources", "nested"), { recursive: true });
    await fs.symlink(outside, path.join(tempDir, "resources", "nested", "escape.txt"));

    await expect(safeRestoreResources(tempDir, destRoot)).resolves.toBe(0);
    await expect(fs.access(path.join(destRoot, "nested", "escape.txt"))).rejects.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("skipping symlink"));
  });

  it("rejects backup directory entries", async () => {
    const warnSpy = jest.spyOn(logger, "warn");
    await fs.mkdir(path.join(tempDir, "resources", "backups_db"), { recursive: true });
    await fs.mkdir(path.join(tempDir, "resources", "backups_db_and_data"), {
      recursive: true,
    });
    await fs.writeFile(path.join(tempDir, "resources", "backups_db", "old.zip"), "old");
    await fs.writeFile(
      path.join(tempDir, "resources", "backups_db_and_data", "full.zip"),
      "full",
    );

    await expect(safeRestoreResources(tempDir, destRoot)).resolves.toBe(0);

    await expect(fs.access(path.join(destRoot, "backups_db", "old.zip"))).rejects.toThrow();
    await expect(
      fs.access(path.join(destRoot, "backups_db_and_data", "full.zip")),
    ).rejects.toThrow();
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });

  it("overwrites existing files", async () => {
    await fs.mkdir(path.join(tempDir, "resources"), { recursive: true });
    await fs.writeFile(path.join(tempDir, "resources", "same.txt"), "new");
    await fs.writeFile(path.join(destRoot, "same.txt"), "old");

    await expect(safeRestoreResources(tempDir, destRoot)).resolves.toBe(1);
    await expect(fs.readFile(path.join(destRoot, "same.txt"), "utf8")).resolves.toBe("new");
  });
});
