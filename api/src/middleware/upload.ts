import crypto from "crypto";
import os from "os";
import multer from "multer";

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024,
  },
});

export const uploadLarge = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (_req, _file, cb) =>
      cb(null, `golightly04_upload_${Date.now()}_${crypto.randomUUID()}.zip`),
  }),
  limits: { fileSize: 500 * 1024 * 1024 },
});
