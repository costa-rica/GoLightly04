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

jest.mock("../../src/lib/db", () => ({
  getDb: () => ({
    SoundFile: soundFileModel,
  }),
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
  });

  it("lists sound files", async () => {
    soundFileModel.findAll.mockResolvedValue([
      { id: 1, name: "Bowl", description: "Calm", filename: "bowl.mp3" },
    ]);

    const response = await request(buildApp()).get("/sounds/sound_files");

    expect(response.status).toBe(200);
    expect(response.body.soundFiles).toEqual([
      { id: 1, name: "Bowl", description: "Calm", filename: "bowl.mp3" },
    ]);
  });

  it("uploads a sound file for admins", async () => {
    soundFileModel.create.mockResolvedValue({
      id: 2,
      name: "Bell",
      description: "Warm",
      filename: "123_bell.mp3",
    });

    const response = await request(buildApp())
      .post("/sounds/upload")
      .set("Authorization", `Bearer ${adminToken}`)
      .field("name", "Bell")
      .field("description", "Warm")
      .attach("file", Buffer.from("audio"), "bell.mp3");

    expect(response.status).toBe(201);
    expect(response.body.soundFile.name).toBe("Bell");
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
});
