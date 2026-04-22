import type {
  DeleteSoundFileResponse,
  GetSoundFilesResponse,
  SoundFile,
  UploadSoundFileResponse,
} from "@golightly/shared-types";

import apiClient from "./client";

export type { SoundFile } from "@golightly/shared-types";

export const getSoundFiles = async (): Promise<GetSoundFilesResponse> => {
  const response = await apiClient.get<GetSoundFilesResponse>(
    "/sounds/sound_files",
  );
  return response.data;
};

export const uploadSoundFile = async (
  file: File,
  name?: string,
  description?: string,
  onProgress?: (percent: number) => void,
): Promise<UploadSoundFileResponse> => {
  const formData = new FormData();
  formData.append("file", file);
  if (name) formData.append("name", name);
  if (description) formData.append("description", description);

  const response = await apiClient.post<UploadSoundFileResponse>(
    "/sounds/upload",
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
      onUploadProgress: (event) => {
        if (!onProgress || !event.total) return;
        const percent = Math.round((event.loaded * 100) / event.total);
        onProgress(percent);
      },
    },
  );
  return response.data;
};

export const deleteSoundFile = async (
  id: number,
): Promise<DeleteSoundFileResponse> => {
  const response = await apiClient.delete<DeleteSoundFileResponse>(
    `/sounds/sound_file/${id}`,
  );
  return response.data;
};
