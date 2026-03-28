import {
  initModels,
  sequelize,
  Queue,
  User,
  Meditation,
  ContractUsersMeditations,
  ElevenLabsFiles,
  ContractMeditationsElevenLabsFiles,
  SoundFiles,
  ContractMeditationsSoundFiles,
} from "@golightly/db-models";

// Initialize all database models once on first load of the worker process.
initModels();

// Export database instance and models
export {
  sequelize,
  Queue,
  User,
  Meditation,
  ContractUsersMeditations,
  ElevenLabsFiles,
  ContractMeditationsElevenLabsFiles,
  SoundFiles,
  ContractMeditationsSoundFiles,
};
