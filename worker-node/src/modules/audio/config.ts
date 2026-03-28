export interface AudioRuntimeConfig {
  projectResourcesPath: string;
  outputDirectory: string;
  csvPath?: string;
}

export function getAudioRuntimeConfig(): AudioRuntimeConfig {
  const outputDirectory = process.env.PATH_MP3_OUTPUT;
  if (!outputDirectory) {
    throw new Error("PATH_MP3_OUTPUT environment variable is not set");
  }

  const projectResourcesPath = process.env.PATH_PROJECT_RESOURCES;
  if (!projectResourcesPath) {
    throw new Error("PATH_PROJECT_RESOURCES environment variable is not set");
  }

  return {
    outputDirectory,
    projectResourcesPath,
    csvPath: process.env.PATH_AND_FILENAME_AUDIO_CSV_FILE || process.env.PATH_AUDIO_CSV_FILE,
  };
}
