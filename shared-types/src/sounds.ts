export type SoundFile = {
  id: number;
  name: string;
  description?: string;
  filename: string;
};

export type GetSoundFilesResponse = {
  soundFiles: SoundFile[];
};

export type UploadSoundFileResponse = {
  message: string;
  soundFile: SoundFile;
};

export type DeleteSoundFileResponse = {
  message: string;
  soundFileId: number;
};
