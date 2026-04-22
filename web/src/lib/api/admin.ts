import type {
  AdminDeleteMeditationResponse,
  DeleteQueueRecordResponse,
  DeleteUserResponse,
  GetAllAdminMeditationsResponse,
  GetQueuerResponse,
  GetUsersResponse,
  RequeueMeditationResponse,
} from "@golightly/shared-types";

import apiClient from "./client";

export type {
  AdminUser,
  GetQueuerResponse,
  GetUsersResponse,
  QueueRecord,
} from "@golightly/shared-types";

export const getUsers = async (): Promise<GetUsersResponse> => {
  const response = await apiClient.get<GetUsersResponse>("/admin/users");
  return response.data;
};

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

export const getAllMeditations =
  async (): Promise<GetAllAdminMeditationsResponse> => {
    const response = await apiClient.get<GetAllAdminMeditationsResponse>(
      "/admin/meditations",
    );
    return response.data;
  };

export const deleteMeditationObj = async (
  meditationId: number,
): Promise<AdminDeleteMeditationResponse> => {
  const response = await apiClient.delete<AdminDeleteMeditationResponse>(
    `/admin/meditations/${meditationId}`,
  );
  return response.data;
};

export const getQueuerRecords = async (): Promise<GetQueuerResponse> => {
  const response = await apiClient.get<GetQueuerResponse>("/admin/queuer");
  return response.data;
};

export const deleteQueuerRecord = async (
  id: number,
): Promise<DeleteQueueRecordResponse> => {
  const response = await apiClient.delete<DeleteQueueRecordResponse>(
    `/admin/queuer/${id}`,
  );
  return response.data;
};

export const requeueMeditation = async (
  meditationId: number,
): Promise<RequeueMeditationResponse> => {
  const response = await apiClient.post<RequeueMeditationResponse>(
    `/admin/meditations/${meditationId}/requeue`,
  );
  return response.data;
};
