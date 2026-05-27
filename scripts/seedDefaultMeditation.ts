import "dotenv/config";

import { createSequelize, getDefaultSequelize, initializeModels, Meditation, SoundFile } from "@golightly/db-models";
import { parseMeditationScript } from "@golightly/shared-types";
import { createMeditationFromElements } from "../api/src/services/meditations/createMeditationFromElements";
import { getOrCreateBenevolentUser } from "../api/src/services/users/getOrCreateBenevolentUser";
import { notifyWorker } from "../api/src/services/workerClient";

const STARTER_SCRIPT = `Welcome. Close your eyes.
<break time="2s" />
[Tibetan Singing Bowl]`;

const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 5 * 60_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForTerminalStatus(meditationId: number): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
    const meditation = await Meditation.findByPk(meditationId);
    if (!meditation) {
      throw new Error(`Template meditation ${meditationId} disappeared`);
    }
    if (meditation.status === "complete") {
      return;
    }
    if (meditation.status === "failed") {
      throw new Error(`Template meditation ${meditationId} failed`);
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`Timed out waiting for template meditation ${meditationId}`);
}

async function main() {
  initializeModels(getDefaultSequelize());

  const existing = await Meditation.findOne({ where: { stage: "template" } });
  if (existing) {
    if (existing.status === "complete") {
      console.log(`Template meditation already complete: ${existing.id}`);
      return;
    }
    throw new Error(`Template meditation already exists but is ${existing.status}`);
  }

  const soundFiles = await SoundFile.findAll();
  const soundMap = new Map(soundFiles.map((sound) => [sound.name.trim().toLowerCase(), sound]));
  if (!soundMap.has("tibetan singing bowl")) {
    throw new Error("Required SoundFile not found: Tibetan Singing Bowl");
  }

  const parseResult = parseMeditationScript(
    STARTER_SCRIPT,
    (bracketText) => soundMap.get(bracketText.trim().toLowerCase()) ?? null,
  );
  if (!parseResult.ok) {
    throw new Error(`Starter script parse failed: ${JSON.stringify(parseResult.errors)}`);
  }

  const user = await getOrCreateBenevolentUser();
  const meditation = await createMeditationFromElements({
    userId: user.id,
    title: "Default meditation template",
    description: "Starter meditation for the Create flow.",
    visibility: "public",
    elements: parseResult.elements,
    sourceMode: "script",
    scriptSource: STARTER_SCRIPT,
    stage: "template",
  });

  await notifyWorker(meditation.id, "intake");
  await waitForTerminalStatus(meditation.id);
  console.log(`Template meditation seeded: ${meditation.id}`);
}

main()
  .catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await getDefaultSequelize().close();
  });
