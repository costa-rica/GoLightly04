export type MeditationVisibility = "public" | "private";
export type MeditationStatus = "pending" | "processing" | "complete" | "failed";

export type MeditationElement = {
  id: number;
  text?: string;
  voice_id?: string;
  speed?: string;
  pause_duration?: string;
  sound_file?: string;
};

export type Meditation = {
  id: number;
  title: string;
  description?: string;
  meditationArray: MeditationElement[];
  filename: string;
  filePath?: string;
  visibility: MeditationVisibility | string;
  createdAt: string;
  updatedAt: string;
  listenCount: number;
  isFavorite?: boolean;
  isOwned?: boolean;
  ownerUserId?: number;
  status?: MeditationStatus;
};

export type CreateMeditationRequest = {
  title: string;
  description?: string;
  visibility: MeditationVisibility;
  meditationArray: MeditationElement[];
};

export type CreateMeditationResponse = {
  message: string;
  queueId: number;
  filePath: string;
};

export type GetAllMeditationsResponse = {
  meditations: Meditation[];
  meditationsArray?: Meditation[];
};

export type FavoriteMeditationResponse = {
  message: string;
  meditationId: number;
  favorite: boolean;
};

export type DeleteMeditationResponse = {
  message: string;
  meditationId: number;
};

export type UpdateMeditationRequest = {
  title?: string;
  description?: string;
  visibility?: MeditationVisibility;
};

export type UpdateMeditationResponse = {
  message: string;
  meditation: Meditation;
};

export type StreamTokenResponse = {
  token: string;
};
