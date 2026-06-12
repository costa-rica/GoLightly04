import fs from "fs/promises";
import os from "os";
import path from "path";

import { safeRestoreResources } from "../../src/lib/safeRestoreResources";
import logger from "../../src/config/logger";

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

  it("rejects DB maintenance directory entries", async () => {
    const warnSpy = jest.spyOn(logger, "warn");
    await fs.mkdir(path.join(tempDir, "resources", "db_backups"), { recursive: true });
    await fs.mkdir(path.join(tempDir, "resources", "db_backups_and_data"), {
      recursive: true,
    });
    await fs.mkdir(path.join(tempDir, "resources", "db_replenish"), { recursive: true });
    await fs.writeFile(path.join(tempDir, "resources", "db_backups", "old.zip"), "old");
    await fs.writeFile(
      path.join(tempDir, "resources", "db_backups_and_data", "full.zip"),
      "full",
    );
    await fs.writeFile(path.join(tempDir, "resources", "db_replenish", "restore.zip"), "restore");

    await expect(safeRestoreResources(tempDir, destRoot)).resolves.toBe(0);

    await expect(fs.access(path.join(destRoot, "db_backups", "old.zip"))).rejects.toThrow();
    await expect(
      fs.access(path.join(destRoot, "db_backups_and_data", "full.zip")),
    ).rejects.toThrow();
    await expect(
      fs.access(path.join(destRoot, "db_replenish", "restore.zip")),
    ).rejects.toThrow();
    expect(warnSpy).toHaveBeenCalledTimes(3);
  });

  it("overwrites existing files through a temporary sibling and rename", async () => {
    const realCopyFile = fs.copyFile.bind(fs);
    const realRename = fs.rename.bind(fs);
    const copyFileSpy = jest.spyOn(fs, "copyFile").mockImplementation(realCopyFile);
    const renameSpy = jest.spyOn(fs, "rename").mockImplementation(realRename);
    await fs.mkdir(path.join(tempDir, "resources"), { recursive: true });
    await fs.writeFile(path.join(tempDir, "resources", "same.txt"), "new");
    const destPath = path.join(destRoot, "same.txt");
    await fs.writeFile(destPath, "old");

    await expect(safeRestoreResources(tempDir, destRoot)).resolves.toBe(1);
    await expect(fs.readFile(destPath, "utf8")).resolves.toBe("new");

    expect(copyFileSpy).toHaveBeenCalledTimes(1);
    const [, tempPath] = copyFileSpy.mock.calls[0];
    expect(tempPath).not.toBe(destPath);
    expect(path.dirname(tempPath.toString())).toBe(destRoot);

    expect(renameSpy).toHaveBeenCalledWith(tempPath, destPath);
    expect(copyFileSpy.mock.invocationCallOrder[0]).toBeLessThan(
      renameSpy.mock.invocationCallOrder[0],
    );
  });

  it("preserves an existing file when copying to the temporary file fails", async () => {
    const copyError = new Error("copy failed");
    jest.spyOn(logger, "error").mockImplementation(() => logger);
    const copyFileSpy = jest.spyOn(fs, "copyFile").mockImplementationOnce(async (_src, dest) => {
      await fs.writeFile(dest, "partial");
      throw copyError;
    });
    await fs.mkdir(path.join(tempDir, "resources"), { recursive: true });
    await fs.writeFile(path.join(tempDir, "resources", "same.txt"), "new");
    const destPath = path.join(destRoot, "same.txt");
    await fs.writeFile(destPath, "old");

    await expect(safeRestoreResources(tempDir, destRoot)).rejects.toBe(copyError);

    await expect(fs.readFile(destPath, "utf8")).resolves.toBe("old");
    await expect(fs.readdir(destRoot)).resolves.toEqual(["same.txt"]);
    expect(copyFileSpy).toHaveBeenCalledTimes(1);
    expect(copyFileSpy.mock.calls[0][1]).not.toBe(destPath);
  });

  it("logs copy failures with production-safe context", async () => {
    const copyError = new Error("operation not permitted");
    const errorSpy = jest.spyOn(logger, "error").mockImplementation(() => logger);
    const copyFileSpy = jest.spyOn(fs, "copyFile").mockRejectedValueOnce(copyError);
    await fs.mkdir(path.join(tempDir, "resources", "audio"), { recursive: true });
    await fs.writeFile(path.join(tempDir, "resources", "audio", "file.mp3"), "sound");

    await expect(safeRestoreResources(tempDir, destRoot)).rejects.toBe(copyError);

    expect(copyFileSpy).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      "safeRestoreResources: resource copy failed",
      expect.objectContaining({
        error: copyError,
        sourcePath: path.join(tempDir, "resources", "audio", "file.mp3"),
        destPath: path.join(destRoot, "audio", "file.mp3"),
        tempDestPath: expect.stringContaining(".file.mp3."),
        relPath: path.join("audio", "file.mp3"),
        tempCleanupError: null,
      }),
    );
  });
});
