import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const usersModel = { findAll: jest.fn() };
const soundFilesModel = { findAll: jest.fn() };
const meditationsModel = { findAll: jest.fn() };
const jobQueueModel = { findAll: jest.fn() };
const contractUserMeditationsModel = { findAll: jest.fn() };

jest.mock("../../src/lib/db", () => ({
  getDb: () => ({
    User: usersModel,
    SoundFile: soundFilesModel,
    Meditation: meditationsModel,
    JobQueue: jobQueueModel,
    ContractUserMeditation: contractUserMeditationsModel,
  }),
}));

const unzipper = require("unzipper") as {
  Open: {
    file: (path: string) => Promise<{
      files: Array<{
        path: string;
        type: string;
        buffer: () => Promise<Buffer>;
      }>;
    }>;
  };
};

async function readZip(zipPath: string) {
  const directory = await unzipper.Open.file(zipPath);
  const files = directory.files.filter((file) => file.type === "File");
  const entries = files.map((file) => file.path).sort();
  const readText = async (name: string) => {
    const entry = files.find((file) => file.path === name);
    if (!entry) throw new Error(`Missing zip entry ${name}`);
    return (await entry.buffer()).toString("utf8");
  };
  return { entries, readText };
}

describe("backupService", () => {
  let resourceRoot: string;

  beforeEach(async () => {
    jest.clearAllMocks();
    resourceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "golightly-worker-backup-resources-"));
    process.env.PATH_PROJECT_RESOURCES = resourceRoot;
    usersModel.findAll.mockResolvedValue([{ id: 1, email: "user@example.com" }]);
    soundFilesModel.findAll.mockResolvedValue([{ id: 2, filename: "sound.mp3" }]);
    meditationsModel.findAll.mockResolvedValue([]);
    jobQueueModel.findAll.mockResolvedValue([]);
    contractUserMeditationsModel.findAll.mockResolvedValue([]);
  });

  afterEach(async () => {
    await fs.rm(resourceRoot, { recursive: true, force: true });
  });

  it("creates a DB-only zip with a manifest and CSVs but no resources", async () => {
    const { createBackup } = await import("../../src/services/backupService");

    await createBackup({ includeResources: false });

    const backupDir = path.join(resourceRoot, "db_backups_and_data");
    const backups = await fs.readdir(backupDir);
    expect(backups).toHaveLength(1);
    expect(backups[0]).toMatch(/^backup_\d{8}_\d{6}\.zip$/);

    const zip = await readZip(path.join(backupDir, backups[0]));
    expect(zip.entries).toEqual(
      expect.arrayContaining([
        "manifest.json",
        "users.csv",
        "sound_files.csv",
        "meditations.csv",
        "jobs_queue.csv",
        "contract_user_meditations.csv",
      ]),
    );
    expect(zip.entries.some((entry) => entry.startsWith("resources/"))).toBe(false);
    expect(JSON.parse(await zip.readText("manifest.json"))).toEqual(
      expect.objectContaining({ package_type: "db_only" }),
    );
  });

  it("creates a combined zip with manifest, CSVs, and resource files", async () => {
    await fs.mkdir(path.join(resourceRoot, "audio"), { recursive: true });
    await fs.writeFile(path.join(resourceRoot, "audio", "file.mp3"), "sound");
    const { createBackup } = await import("../../src/services/backupService");

    await createBackup({ includeResources: true });

    const backups = await fs.readdir(path.join(resourceRoot, "db_backups_and_data"));
    expect(backups[0]).toMatch(/^backup_w_sound_files_\d{8}_\d{6}\.zip$/);
    const zip = await readZip(path.join(resourceRoot, "db_backups_and_data", backups[0]));
    expect(zip.entries).toEqual(expect.arrayContaining(["resources/audio/file.mp3"]));
    expect(JSON.parse(await zip.readText("manifest.json"))).toEqual(
      expect.objectContaining({
        created_at: expect.any(String),
        app: "GoLightly04",
        environment: "testing",
        package_type: "db_and_resources",
        database_tables: [
          "users",
          "sound_files",
          "meditations",
          "jobs_queue",
          "contract_user_meditations",
        ],
        resources_root: resourceRoot,
        excluded_dirs: ["db_backups", "db_backups_and_data", "db_replenish"],
      }),
    );
  });

  it("excludes backup directories from combined backups", async () => {
    await fs.mkdir(path.join(resourceRoot, "db_backups"), { recursive: true });
    await fs.mkdir(path.join(resourceRoot, "db_backups_and_data"), { recursive: true });
    await fs.mkdir(path.join(resourceRoot, "db_replenish"), { recursive: true });
    await fs.writeFile(path.join(resourceRoot, "db_backups", "old.zip"), "old");
    await fs.writeFile(path.join(resourceRoot, "db_backups_and_data", "full.zip"), "full");
    await fs.writeFile(path.join(resourceRoot, "db_replenish", "restore.zip"), "restore");
    await fs.writeFile(path.join(resourceRoot, "keep.txt"), "keep");
    const { createBackup } = await import("../../src/services/backupService");

    await createBackup({ includeResources: true });

    const backups = (await fs.readdir(path.join(resourceRoot, "db_backups_and_data"))).filter(
      (file) => file.startsWith("backup_w_sound_files_"),
    );
    const zip = await readZip(path.join(resourceRoot, "db_backups_and_data", backups[0]));
    expect(zip.entries).toEqual(expect.arrayContaining(["resources/keep.txt"]));
    expect(zip.entries).not.toEqual(expect.arrayContaining(["resources/db_backups/old.zip"]));
    expect(zip.entries).not.toEqual(
      expect.arrayContaining(["resources/db_backups_and_data/full.zip"]),
    );
    expect(zip.entries).not.toEqual(
      expect.arrayContaining(["resources/db_replenish/restore.zip"]),
    );
  });

  it("skips symlinks while completing the backup", async () => {
    const warnSpy = jest.spyOn((await import("../../src/config/logger")).default, "warn");
    await fs.writeFile(path.join(resourceRoot, "target.txt"), "target");
    await fs.symlink(path.join(resourceRoot, "target.txt"), path.join(resourceRoot, "link.txt"));
    const { createBackup } = await import("../../src/services/backupService");

    await createBackup({ includeResources: true });

    const backups = (await fs.readdir(path.join(resourceRoot, "db_backups_and_data"))).filter(
      (file) => file.startsWith("backup_w_sound_files_"),
    );
    const zip = await readZip(path.join(resourceRoot, "db_backups_and_data", backups[0]));
    expect(zip.entries).toEqual(expect.arrayContaining(["resources/target.txt"]));
    expect(zip.entries).not.toEqual(expect.arrayContaining(["resources/link.txt"]));
    expect(warnSpy).toHaveBeenCalled();
  });

  it("cleans up temp directories on success and failure", async () => {
    const { createBackup } = await import("../../src/services/backupService");
    const listBackupTemps = async () =>
      (await fs.readdir(os.tmpdir())).filter((entry) => entry.startsWith("golightly04_backup_"));

    const beforeSuccess = await listBackupTemps();
    await createBackup({ includeResources: false });
    expect(await listBackupTemps()).toEqual(beforeSuccess);

    usersModel.findAll.mockRejectedValueOnce(new Error("export failed"));
    const beforeFailure = await listBackupTemps();
    await expect(createBackup({ includeResources: false })).rejects.toThrow("export failed");
    expect(await listBackupTemps()).toEqual(beforeFailure);
  });

  it("guards concurrent backup calls", async () => {
    let resolveFindAll: (rows: Array<Record<string, unknown>>) => void = () => undefined;
    usersModel.findAll.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFindAll = resolve;
      }),
    );
    const { createBackup, isBackupRunning } = await import("../../src/services/backupService");

    const running = createBackup({ includeResources: false });
    await new Promise((resolve) => setImmediate(resolve));

    expect(isBackupRunning()).toBe(true);
    await expect(createBackup({ includeResources: false })).rejects.toThrow(
      "A backup job is already running",
    );

    resolveFindAll([{ id: 1 }]);
    await running;
    expect(isBackupRunning()).toBe(false);
  });

  it("skips non-regular entries in the resource walk", async () => {
    jest.resetModules();
    const warn = jest.fn();
    const readdir = jest.fn().mockResolvedValue(["special"]);
    const lstat = jest.fn().mockResolvedValue({
      isSymbolicLink: () => false,
      isDirectory: () => false,
      isFile: () => false,
    });
    const copyFile = jest.fn();

    jest.doMock("node:fs/promises", () => ({
      __esModule: true,
      default: { readdir, lstat, copyFile },
      readdir,
      lstat,
      mkdir: jest.fn(),
      copyFile,
    }));
    jest.doMock("../../src/config/logger", () => ({
      __esModule: true,
      default: { warn, info: jest.fn(), error: jest.fn() },
    }));

    await jest.isolateModulesAsync(async () => {
      const { walkResourcesForBackup } = await import("../../src/services/backupService");
      await walkResourcesForBackup("/src", "/dest", "/src");
    });

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("skipping non-regular entry"));
    expect(copyFile).not.toHaveBeenCalled();
    jest.dontMock("node:fs/promises");
    jest.dontMock("../../src/config/logger");
  });
});
