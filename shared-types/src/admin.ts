import type { Meditation } from "./meditation";

export type AdminUser = {
  id: number;
  username?: string | null;
  email: string;
  authProvider: "local" | "google" | "both";
  isEmailVerified: boolean;
  emailVerifiedAt: string | null;
  isAdmin: boolean;
  hasPublicMeditations: boolean;
  createdAt: string;
  updatedAt: string;
};

export type GetUsersResponse = {
  users: AdminUser[];
};

export type DeleteUserResponse = {
  message: string;
  userId: number;
};

export type GetAllAdminMeditationsResponse = {
  meditations: Meditation[];
};

export type AdminDeleteMeditationResponse = {
  message: string;
  meditationId: number;
};

export type QueueRecord = {
  id: number;
  meditationId: number;
  sequence: number;
  type: "text" | "sound" | "pause";
  status: "pending" | "processing" | "complete" | "failed";
  filePath: string | null;
  attemptCount: number;
  lastError: string | null;
  lastAttemptedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type GetQueuerResponse = {
  queue: QueueRecord[];
};

export type DeleteQueueRecordResponse = {
  message: string;
  queueId: number;
};

export type RequeueMeditationResponse = {
  message: string;
  meditationId: number;
};
