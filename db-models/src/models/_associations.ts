import { User } from "./User";
import { Meditation } from "./Meditation";
import { ContractUsersMeditations } from "./ContractUsersMeditations";
import { ContractUserMeditationsListen } from "./ContractUserMeditationsListen";
import { Queue } from "./Queue";
import { ElevenLabsFiles } from "./ElevenLabsFiles";
import { ContractMeditationsElevenLabsFiles } from "./ContractMeditationsElevenLabsFiles";
import { SoundFiles } from "./SoundFiles";
import { ContractMeditationsSoundFiles } from "./ContractMeditationsSoundFiles";

export function applyAssociations() {
  // User ↔ Meditation (many-to-many through ContractUsersMeditations)
  User.belongsToMany(Meditation, {
    through: ContractUsersMeditations,
    foreignKey: "userId",
    otherKey: "meditationId",
    as: "meditations",
  });

  Meditation.belongsToMany(User, {
    through: ContractUsersMeditations,
    foreignKey: "meditationId",
    otherKey: "userId",
    as: "users",
  });

  // ContractUsersMeditations associations
  ContractUsersMeditations.belongsTo(User, {
    foreignKey: "userId",
    as: "user",
  });

  ContractUsersMeditations.belongsTo(Meditation, {
    foreignKey: "meditationId",
    as: "meditation",
  });

  User.hasMany(ContractUsersMeditations, {
    foreignKey: "userId",
    as: "userMeditations",
  });

  Meditation.hasMany(ContractUsersMeditations, {
    foreignKey: "meditationId",
    as: "contractUsersMeditations",
  });

  // ContractUserMeditationsListen associations
  ContractUserMeditationsListen.belongsTo(User, {
    foreignKey: "userId",
    as: "user",
  });

  ContractUserMeditationsListen.belongsTo(Meditation, {
    foreignKey: "meditationId",
    as: "meditation",
  });

  User.hasMany(ContractUserMeditationsListen, {
    foreignKey: "userId",
    as: "meditationListens",
  });

  Meditation.hasMany(ContractUserMeditationsListen, {
    foreignKey: "meditationId",
    as: "contractUserMeditationListenCount",
  });

  // Queue associations
  Queue.belongsTo(User, {
    foreignKey: "userId",
    as: "user",
  });

  User.hasMany(Queue, {
    foreignKey: "userId",
    as: "queueItems",
  });

  // Meditation ↔ ElevenLabsFiles (many-to-many through ContractMeditationsElevenLabsFiles)
  Meditation.belongsToMany(ElevenLabsFiles, {
    through: ContractMeditationsElevenLabsFiles,
    foreignKey: "meditationId",
    otherKey: "elevenLabsFilesId",
    as: "elevenLabsFiles",
  });

  ElevenLabsFiles.belongsToMany(Meditation, {
    through: ContractMeditationsElevenLabsFiles,
    foreignKey: "elevenLabsFilesId",
    otherKey: "meditationId",
    as: "meditations",
  });

  // ContractMeditationsElevenLabsFiles associations
  ContractMeditationsElevenLabsFiles.belongsTo(Meditation, {
    foreignKey: "meditationId",
    as: "meditation",
  });

  ContractMeditationsElevenLabsFiles.belongsTo(ElevenLabsFiles, {
    foreignKey: "elevenLabsFilesId",
    as: "elevenLabsFile",
  });

  // Meditation ↔ SoundFiles (many-to-many through ContractMeditationsSoundFiles)
  Meditation.belongsToMany(SoundFiles, {
    through: ContractMeditationsSoundFiles,
    foreignKey: "meditationId",
    otherKey: "soundFilesId",
    as: "soundFiles",
  });

  SoundFiles.belongsToMany(Meditation, {
    through: ContractMeditationsSoundFiles,
    foreignKey: "soundFilesId",
    otherKey: "meditationId",
    as: "meditations",
  });

  // ContractMeditationsSoundFiles associations
  ContractMeditationsSoundFiles.belongsTo(Meditation, {
    foreignKey: "meditationId",
    as: "meditation",
  });

  ContractMeditationsSoundFiles.belongsTo(SoundFiles, {
    foreignKey: "soundFilesId",
    as: "soundFile",
  });
}
