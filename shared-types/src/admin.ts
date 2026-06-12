import type { Meditation, MeditationVisibility } from "./meditation";

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

export type AdminMeditation = Meditation & {
  isBenevolentOwned: boolean;
  ownerEmail?: string;
};

export type GetAllAdminMeditationsResponse = {
  meditations: AdminMeditation[];
};

export type AdminDeleteMeditationResponse = {
  message: string;
  meditationId: number;
};

export type AdminUpdateMeditationMetadataRequest = {
  title?: string;
  description?: string;
  visibility?: MeditationVisibility;
};

export type AdminUpdateMeditationMetadataResponse = {
  message: string;
  meditation: AdminMeditation;
};

export type AdminSetDefaultMeditationResponse = {
  message: string;
  meditation: AdminMeditation;
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
