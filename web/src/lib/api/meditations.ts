import type {
  CreateMeditationRequest,
  CreateMeditationResponse,
  DeleteMeditationResponse,
  FavoriteMeditationResponse,
  GetAllMeditationsResponse,
  StreamTokenResponse,
  UpdateMeditationRequest,
  UpdateMeditationResponse,
} from "@golightly/shared-types";

import apiClient from "./client";

export const getAllMeditations = async (
  accessToken?: string | null,
): Promise<GetAllMeditationsResponse> => {
  const response = await apiClient.get<GetAllMeditationsResponse>(
    "/meditations/all",
    {
      headers: accessToken
        ? { Authorization: `Bearer ${accessToken}` }
        : undefined,
    },
  );
  const data = response.data;
  return {
    ...data,
    meditations: data.meditations ?? data.meditationsArray ?? [],
  };
};

export const createMeditation = async (
  data: CreateMeditationRequest,
): Promise<CreateMeditationResponse> => {
  const response = await apiClient.post<CreateMeditationResponse>(
    "/meditations/create",
    data,
  );
  return response.data;
};

export const getStreamUrl = (id: number): string => {
  const baseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000";
  return `${baseUrl}/meditations/${id}/stream`;
};

export const getStreamToken = async (
  meditationId: number,
): Promise<StreamTokenResponse> => {
  const response = await apiClient.get<StreamTokenResponse>(
    `/meditations/${meditationId}/stream-token`,
  );
  return response.data;
};

export const favoriteMeditation = async (
  meditationId: number,
  isFavorite: boolean,
): Promise<FavoriteMeditationResponse> => {
  const trueOrFalse = isFavorite ? "true" : "false";
  const response = await apiClient.post<FavoriteMeditationResponse>(
    `/meditations/favorite/${meditationId}/${trueOrFalse}`,
  );
  return response.data;
};

export const updateMeditationObj = async (
  id: number,
  data: UpdateMeditationRequest,
): Promise<UpdateMeditationResponse> => {
  const response = await apiClient.patch<UpdateMeditationResponse>(
    `/meditations/update/${id}`,
    data,
  );
  return response.data;
};

export const deleteMeditationObj = async (
  id: number,
): Promise<DeleteMeditationResponse> => {
  const response = await apiClient.delete<DeleteMeditationResponse>(
    `/meditations/${id}`,
  );
  return response.data;
};
