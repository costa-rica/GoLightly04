import fs from "fs/promises";
import os from "os";
import path from "path";

import express from "express";
import request from "supertest";

import { uploadLarge } from "../../src/middleware/upload";

describe("uploadLarge", () => {
  it("uses a server-generated filename so multipart filename traversal cannot escape os.tmpdir", async () => {
    let uploadedPath = "";
    const app = express();
    app.post("/upload", uploadLarge.single("file"), (req, res) => {
      uploadedPath = req.file?.path ?? "";
      res.json({ path: uploadedPath });
    });

    const traversalTarget = path.resolve(os.tmpdir(), "..", "..", "evil.zip");
    await fs.rm(traversalTarget, { force: true });

    const response = await request(app)
      .post("/upload")
      .attach("file", Buffer.from("zip"), "../../evil.zip");

    expect(response.status).toBe(200);
    expect(path.resolve(uploadedPath).startsWith(path.resolve(os.tmpdir()) + path.sep)).toBe(true);
    expect(path.basename(uploadedPath)).toMatch(/^golightly04_upload_.*\.zip$/);
    await expect(fs.access(traversalTarget)).rejects.toThrow();
    await fs.rm(uploadedPath, { force: true });
  });
});
