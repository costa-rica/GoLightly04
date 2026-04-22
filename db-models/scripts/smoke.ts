import { ContractUserMeditation, JobQueue, Meditation, SoundFile, User, createSequelize, provisionDatabase } from "../src";

async function run(): Promise<void> {
  if (process.env.SMOKE !== "1") {
    throw new Error("Set SMOKE=1 to run the db-models smoke script.");
  }

  const sequelize = createSequelize({ role: "boot" });
  try {
    await provisionDatabase(sequelize);

    const user = await User.create({
      email: "smoke@example.com",
      password: "smoke-password",
    });

    const meditation = await Meditation.create({
      userId: user.id,
      title: "Smoke Meditation",
      meditationArray: [],
    });

    await SoundFile.create({
      name: "Bowl",
      filename: "bowl.mp3",
    });

    await JobQueue.create({
      meditationId: meditation.id,
      sequence: 1,
      type: "pause",
      inputData: JSON.stringify({ pause_duration: "5" }),
    });

    await ContractUserMeditation.create({
      userId: user.id,
      meditationId: meditation.id,
    });
  } finally {
    await sequelize.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
