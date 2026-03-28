const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "golightly03-db-models-"));
process.env.PATH_DATABASE = tempDir;
process.env.NAME_DB = "test.sqlite";

const dbModels = require("../dist/index.js");

test("exports the expected database surface", () => {
  const expectedExports = [
    "initModels",
    "sequelize",
    "User",
    "Meditation",
    "ContractUsersMeditations",
    "ContractUserMeditationsListen",
    "ElevenLabsFiles",
    "Queue",
    "SoundFiles",
    "ContractMeditationsElevenLabsFiles",
    "ContractMeditationsSoundFiles",
  ];

  for (const exportName of expectedExports) {
    assert.ok(dbModels[exportName], `missing export: ${exportName}`);
  }
});

test("initializes models and connects to a sqlite database", async () => {
  const initialized = dbModels.initModels();

  assert.equal(initialized.sequelize.getDialect(), "sqlite");
  assert.equal(
    initialized.sequelize.options.storage,
    path.join(tempDir, "test.sqlite"),
  );

  await initialized.sequelize.authenticate();
  await initialized.sequelize.sync();

  assert.ok(fs.existsSync(path.join(tempDir, "test.sqlite")));

  await initialized.sequelize.close();
});
