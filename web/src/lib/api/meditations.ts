import apiClient from "./client";
import {
  Meditation,
  MeditationElement,
} from "@/store/features/meditationSlice";

export interface CreateMeditationRequest {
  title: string;
  description?: string;
  visibility: "public" | "private";
  meditationArray: MeditationElement[];
}

export interface CreateMeditationResponse {
  message: string;
  queueId: number;
  filePath: string;
}

export interface GetAllMeditationsResponse {
  meditations: Meditation[];
  meditationsArray?: Meditation[];
}

export interface FavoriteMeditationResponse {
  message: string;
  meditationId: number;
  favorite: boolean;
}

export interface DeleteMeditationResponse {
  message: string;
  meditationId: number;
}

export interface UpdateMeditationRequest {
  title?: string;
  description?: string;
  visibility?: "public" | "private";
}

export interface UpdateMeditationResponse {
  message: string;
  meditation: Meditation;
}

// GET /meditations/all
// Authentication is optional - if provided, returns public + user's private meditations
// If not provided, returns only public meditations
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

// POST /meditations/create
export const createMeditation = async (
  data: CreateMeditationRequest,
): Promise<CreateMeditationResponse> => {
  const response = await apiClient.post<CreateMeditationResponse>(
    "/meditations/create",
    data,
  );
  return response.data;
};

// GET /meditations/:id/stream - Returns stream URL
export const getStreamUrl = (id: number): string => {
  const baseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000";
  return `${baseUrl}/meditations/${id}/stream`;
};

// POST /meditations/favorite/:meditationId/:trueOrFalse
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

// PATCH /meditations/update/:id
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

// DELETE /meditations/:id
export const deleteMeditationObj = async (
  id: number,
): Promise<DeleteMeditationResponse> => {
  const response = await apiClient.delete<DeleteMeditationResponse>(
    `/meditations/${id}`,
  );
  return response.data;
};
