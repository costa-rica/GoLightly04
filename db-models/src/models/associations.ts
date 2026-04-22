import { Sequelize } from "sequelize";
import { ContractUserMeditation, initContractUserMeditationModel } from "./ContractUserMeditation";
import { JobQueue, initJobQueueModel } from "./JobQueue";
import { Meditation, initMeditationModel } from "./Meditation";
import { SoundFile, initSoundFileModel } from "./SoundFile";
import { User, initUserModel } from "./User";

let initializedFor: Sequelize | null = null;

export function initializeModels(sequelize: Sequelize): void {
  if (initializedFor === sequelize) {
    return;
  }

  initUserModel(sequelize);
  initSoundFileModel(sequelize);
  initMeditationModel(sequelize);
  initJobQueueModel(sequelize);
  initContractUserMeditationModel(sequelize);

  User.hasMany(Meditation, { foreignKey: "userId" });
  Meditation.belongsTo(User, { foreignKey: "userId" });

  Meditation.hasMany(JobQueue, {
    foreignKey: "meditationId",
    onDelete: "CASCADE",
    hooks: true,
  });
  JobQueue.belongsTo(Meditation, { foreignKey: "meditationId" });

  Meditation.hasMany(ContractUserMeditation, {
    foreignKey: "meditationId",
    onDelete: "CASCADE",
    hooks: true,
  });
  ContractUserMeditation.belongsTo(Meditation, { foreignKey: "meditationId" });

  User.hasMany(ContractUserMeditation, {
    foreignKey: "userId",
    onDelete: "CASCADE",
    hooks: true,
  });
  ContractUserMeditation.belongsTo(User, { foreignKey: "userId" });

  initializedFor = sequelize;
}
