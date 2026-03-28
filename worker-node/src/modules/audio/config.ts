export interface AudioRuntimeConfig {
  projectResourcesPath: string;
  outputDirectory: string;
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
  };
}
