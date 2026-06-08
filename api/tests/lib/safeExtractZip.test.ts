import fs from "fs";
import fsPromises from "fs/promises";
import os from "os";
import path from "path";

import archiver from "archiver";

import {
  isEntryAllowed,
  isEntryNameSafe,
  safeExtractZip,
} from "../../src/lib/safeExtractZip";

async function createZip(
  entries: Array<{ name: string; content?: string; directory?: boolean }>,
): Promise<string> {
  const zipPath = path.join(
    await fsPromises.mkdtemp(path.join(os.tmpdir(), "golightly-safe-zip-file-")),
    "test.zip",
  );
  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });
    output.on("close", () => resolve());
    archive.on("error", reject);
    archive.pipe(output);
    for (const entry of entries) {
      if (entry.directory) {
        archive.append("", { name: entry.name.endsWith("/") ? entry.name : `${entry.name}/` });
      } else {
        archive.append(entry.content ?? "", { name: entry.name });
      }
    }
    void archive.finalize();
  });
  return zipPath;
}

describe("safeExtractZip", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "golightly-safe-extract-"));
  });

  afterEach(async () => {
    await fsPromises.rm(tempDir, { recursive: true, force: true });
  });

  it("extracts a clean manifest, CSV, and resource file", async () => {
    const zipPath = await createZip([
      { name: "manifest.json", content: "{}" },
      { name: "users.csv", content: "id\n1\n" },
      { name: "resources/audio/file.mp3", content: "sound" },
    ]);

    const result = await safeExtractZip(zipPath, tempDir);

    expect(result).toEqual({
      hasManifest: true,
      csvFiles: ["users.csv"],
      resourceCount: 1,
      skippedEntries: [],
    });
    await expect(fsPromises.readFile(path.join(tempDir, "manifest.json"), "utf8")).resolves.toBe("{}");
    await expect(
      fsPromises.readFile(path.join(tempDir, "resources", "audio", "file.mp3"), "utf8"),
    ).resolves.toBe("sound");
  });

  it.each([
    ["../../outside.txt"],
    ["resources/../../outside.txt"],
    ["/etc/passwd"],
    ["C:\\Windows\\system32\\evil.dll"],
    ["resources/audio/../../../etc/hosts"],
    ["secretdir/evil.txt"],
  ])("skips unsafe or unexpected entry %s", async (entryName) => {
    const zipPath = await createZip([{ name: entryName, content: "evil" }]);

    const result = await safeExtractZip(zipPath, tempDir);

    expect(result.skippedEntries).toHaveLength(1);
    expect(result.resourceCount).toBe(0);
    await expect(fsPromises.access(path.resolve(tempDir, "../../outside.txt"))).rejects.toThrow();
  });

  it("rejects raw unsafe names before extraction", () => {
    expect(isEntryNameSafe("")).toBe(false);
    expect(isEntryNameSafe("/etc/passwd")).toBe(false);
    expect(isEntryNameSafe("C:/Windows/system32/evil.dll")).toBe(false);
    expect(isEntryNameSafe("resources/../../outside.txt")).toBe(false);
    expect(isEntryNameSafe("resources/audio/file.mp3")).toBe(true);
  });

  it("allows only manifest, root CSVs, and resources files", () => {
    expect(isEntryAllowed("manifest.json")).toBe(true);
    expect(isEntryAllowed("users.csv")).toBe(true);
    expect(isEntryAllowed("resources/audio/file.mp3")).toBe(true);
    expect(isEntryAllowed("resources/")).toBe(false);
    expect(isEntryAllowed("nested/users.csv")).toBe(false);
    expect(isEntryAllowed("secretdir/evil.txt")).toBe(false);
  });

  it("skips a bare resources directory entry", async () => {
    const zipPath = await createZip([{ name: "resources/", directory: true }]);

    const result = await safeExtractZip(zipPath, tempDir);

    expect(result.skippedEntries).toEqual(["resources/"]);
    expect(result.resourceCount).toBe(0);
  });

  it("supports legacy CSV-only zips", async () => {
    const zipPath = await createZip([
      { name: "users.csv", content: "id\n1\n" },
      { name: "sound_files.csv", content: "" },
    ]);

    const result = await safeExtractZip(zipPath, tempDir);

    expect(result.hasManifest).toBe(false);
    expect(result.csvFiles.sort()).toEqual(["sound_files.csv", "users.csv"]);
    expect(result.resourceCount).toBe(0);
    await expect(fsPromises.readFile(path.join(tempDir, "users.csv"), "utf8")).resolves.toBe("id\n1\n");
  });
});
