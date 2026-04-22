import apiClient from "./client";
import { Meditation } from "@/store/features/meditationSlice";

export interface AdminUser {
  id: number;
  username?: string | null;
  email: string;
  isEmailVerified: boolean;
  emailVerifiedAt: string | null;
  isAdmin: boolean;
  hasPublicMeditations: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GetUsersResponse {
  users: AdminUser[];
}

export interface DeleteUserResponse {
  message: string;
  userId: number;
}

export interface GetAllMeditationsResponse {
  meditations: Meditation[];
}

export interface DeleteMeditationResponse {
  message: string;
  meditationId: number;
}

export interface QueueRecord {
  id: number;
  userId: number;
  status: "queued" | "started" | "elevenlabs" | "concatenator" | "done";
  jobFilename: string;
  createdAt: string;
  updatedAt: string;
}

export interface GetQueuerResponse {
  queue: QueueRecord[];
}

export interface DeleteQueueRecordResponse {
  message: string;
  queueId: number;
}

// GET /admin/users
export const getUsers = async (): Promise<GetUsersResponse> => {
  const response = await apiClient.get<GetUsersResponse>("/admin/users");
  return response.data;
};

// DELETE /admin/users/:id
export const deleteUser = async (
  id: number,
  options?: { savePublicMeditationsAsBenevolentUser?: boolean },
): Promise<DeleteUserResponse> => {
  const response = await apiClient.delete<DeleteUserResponse>(
    `/admin/users/${id}`,
    {
      data: options,
    },
  );
  return response.data;
};

// GET /admin/meditations
export const getAllMeditations =
  async (): Promise<GetAllMeditationsResponse> => {
    const response =
      await apiClient.get<GetAllMeditationsResponse>("/admin/meditations");
    return response.data;
  };

// DELETE /admin/meditations/:meditationId
export const deleteMeditationObj = async (
  meditationId: number,
): Promise<DeleteMeditationResponse> => {
  const response = await apiClient.delete<DeleteMeditationResponse>(
    `/admin/meditations/${meditationId}`,
  );
  return response.data;
};

// GET /admin/queuer
export const getQueuerRecords = async (): Promise<GetQueuerResponse> => {
  const response = await apiClient.get<GetQueuerResponse>("/admin/queuer");
  return response.data;
};

// DELETE /admin/queuer/:id
export const deleteQueuerRecord = async (
  id: number,
): Promise<DeleteQueueRecordResponse> => {
  const response = await apiClient.delete<DeleteQueueRecordResponse>(
    `/admin/queuer/${id}`,
  );
  return response.data;
};
