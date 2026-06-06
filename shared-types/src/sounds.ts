export type SoundFile = {
  id: number;
  name: string;
  description?: string | null;
  filename: string;
  duration_seconds?: number | null;
};

export type GetSoundFilesResponse = {
  soundFiles: SoundFile[];
};

export type UploadSoundFileResponse = {
  message: string;
  soundFile: SoundFile;
};

export type UpdateSoundFileRequest = {
  name?: string;
  description?: string | null;
  duration_seconds?: number | null;
};

export type UpdateSoundFileResponse = {
  message: string;
  soundFile: SoundFile;
};

export type DeleteSoundFileResponse = {
  message: string;
  soundFileId: number;
};
