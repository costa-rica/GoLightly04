import fs from "fs/promises";
import os from "os";
import path from "path";
import request from "supertest";
import { buildApp } from "../../src/app";
import { issueAccessToken } from "../../src/lib/authTokens";

const soundFileModel = {
  findAll: jest.fn(),
  create: jest.fn(),
  findByPk: jest.fn(),
};
const probeDurationSeconds = jest.fn();

jest.mock("../../src/lib/db", () => ({
  getDb: () => ({
    SoundFile: soundFileModel,
  }),
}));

jest.mock("../../src/lib/audioMetadata", () => ({
  probeDurationSeconds: (...args: unknown[]) => probeDurationSeconds(...args),
}));

describe("sounds routes", () => {
  const adminToken = issueAccessToken({
    id: 1,
    email: "admin@example.com",
    isAdmin: true,
    authProvider: "local",
  });

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.PATH_PROJECT_RESOURCES = path.join(os.tmpdir(), "golightly04-sounds-tests");
    soundFileModel.findAll.mockResolvedValue([]);
    probeDurationSeconds.mockResolvedValue(null);
  });

  it("lists sound files with duration", async () => {
    soundFileModel.findAll.mockResolvedValue([
      {
        id: 1,
        name: "Bowl",
        description: "Calm",
        filename: "bowl.mp3",
        durationSeconds: 42,
      },
    ]);

    const response = await request(buildApp()).get("/sounds/sound_files");

    expect(response.status).toBe(200);
    expect(response.body.soundFiles).toEqual([
      {
        id: 1,
        name: "Bowl",
        description: "Calm",
        filename: "bowl.mp3",
        duration_seconds: 42,
      },
    ]);
  });

  it("uploads a sound file for admins with probed duration", async () => {
    probeDurationSeconds.mockResolvedValue(17);
    soundFileModel.create.mockResolvedValue({
      id: 2,
      name: "Bell",
      description: "Warm",
      filename: "123_bell.mp3",
      durationSeconds: 17,
    });

    const response = await request(buildApp())
      .post("/sounds/upload")
      .set("Authorization", `Bearer ${adminToken}`)
      .field("name", "Bell")
      .field("description", "Warm")
      .attach("file", Buffer.from("audio"), "bell.mp3");

    expect(response.status).toBe(201);
    expect(response.body.soundFile.name).toBe("Bell");
    expect(response.body.soundFile.duration_seconds).toBe(17);
    expect(soundFileModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ durationSeconds: 17 }),
    );
  });

  it("uploads a sound file when duration probing fails", async () => {
    probeDurationSeconds.mockResolvedValue(null);
    soundFileModel.create.mockResolvedValue({
      id: 3,
      name: "Rain",
      description: null,
      filename: "123_rain.mp3",
      durationSeconds: null,
    });

    const response = await request(buildApp())
      .post("/sounds/upload")
      .set("Authorization", `Bearer ${adminToken}`)
      .field("name", "Rain")
      .attach("file", Buffer.from("audio"), "rain.mp3");

    expect(response.status).toBe(201);
    expect(response.body.soundFile.duration_seconds).toBeNull();
    expect(soundFileModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ durationSeconds: null }),
    );
  });

  it("rejects duplicate normalized sound names", async () => {
    soundFileModel.findAll.mockResolvedValue([
      { id: 1, name: "Tibetan Singing Bowl", filename: "bowl.mp3" },
    ]);

    const response = await request(buildApp())
      .post("/sounds/upload")
      .set("Authorization", `Bearer ${adminToken}`)
      .field("name", " tibetan singing bowl ")
      .attach("file", Buffer.from("audio"), "bowl-copy.mp3");

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("DUPLICATE_SOUND_NAME");
    expect(soundFileModel.create).not.toHaveBeenCalled();
  });

  it("deletes a sound file", async () => {
    process.env.PATH_PROJECT_RESOURCES = path.join(os.tmpdir(), "golightly04-sounds-delete");
    const filename = "delete_me.mp3";
    const targetPath = path.join(process.env.PATH_PROJECT_RESOURCES, "prerecorded_audio", filename);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, "audio");

    soundFileModel.findByPk.mockResolvedValue({
      filename,
      destroy: jest.fn().mockResolvedValue(undefined),
    });

    const response = await request(buildApp())
      .delete("/sounds/sound_file/5")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.soundFileId).toBe(5);
  });

  it("patches sound file name description and duration", async () => {
    const soundFile = {
      id: 7,
      name: "Bell",
      description: "Warm",
      filename: "bell.mp3",
      durationSeconds: 12,
      update: jest.fn().mockImplementation(async (updates) => {
        Object.assign(soundFile, updates);
        return soundFile;
      }),
    };
    soundFileModel.findByPk.mockResolvedValue(soundFile);
    soundFileModel.findAll.mockResolvedValue([soundFile]);

    const response = await request(buildApp())
      .patch("/sounds/sound_file/7")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Soft Bell", description: "Gentle", duration_seconds: 21 });

    expect(response.status).toBe(200);
    expect(soundFile.update).toHaveBeenCalledWith({
      name: "Soft Bell",
      description: "Gentle",
      durationSeconds: 21,
    });
    expect(response.body.soundFile).toEqual({
      id: 7,
      name: "Soft Bell",
      description: "Gentle",
      filename: "bell.mp3",
      duration_seconds: 21,
    });
  });

  it("patch clears sound file description and duration", async () => {
    const soundFile = {
      id: 8,
      name: "Ocean",
      description: "Blue",
      filename: "ocean.mp3",
      durationSeconds: 45,
      update: jest.fn().mockImplementation(async (updates) => {
        Object.assign(soundFile, updates);
        return soundFile;
      }),
    };
    soundFileModel.findByPk.mockResolvedValue(soundFile);

    const response = await request(buildApp())
      .patch("/sounds/sound_file/8")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ description: null, duration_seconds: null });

    expect(response.status).toBe(200);
    expect(soundFile.update).toHaveBeenCalledWith({
      description: null,
      durationSeconds: null,
    });
    expect(response.body.soundFile.description).toBeNull();
    expect(response.body.soundFile.duration_seconds).toBeNull();
  });

  it("patch duplicate sound name returns 409", async () => {
    const soundFile = {
      id: 9,
      name: "Rain",
      description: null,
      filename: "rain.mp3",
      durationSeconds: null,
      update: jest.fn(),
    };
    soundFileModel.findByPk.mockResolvedValue(soundFile);
    soundFileModel.findAll.mockResolvedValue([
      soundFile,
      { id: 10, name: "Forest", filename: "forest.mp3" },
    ]);

    const response = await request(buildApp())
      .patch("/sounds/sound_file/9")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: " forest " });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("DUPLICATE_SOUND_NAME");
    expect(soundFile.update).not.toHaveBeenCalled();
  });

  it("patch unknown sound ID returns 404", async () => {
    soundFileModel.findByPk.mockResolvedValue(null);

    const response = await request(buildApp())
      .patch("/sounds/sound_file/404")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Missing" });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("NOT_FOUND");
  });
});
