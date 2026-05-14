export type MeditationVisibility = "public" | "private";
export type MeditationStatus = "pending" | "processing" | "complete" | "failed";
export type SourceMode = "spreadsheet" | "script";

export type MeditationElement = {
  id: number;
  text?: string;
  voice_id?: string;
  speed?: string | number;
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
  sourceMode?: SourceMode;
  scriptSource?: string | null;
};

export type CreateMeditationRequest = {
  title: string;
  description?: string;
  visibility: MeditationVisibility;
  meditationArray: MeditationElement[];
};

export type CreateMeditationScriptRequest = {
  title: string;
  description?: string;
  visibility: MeditationVisibility;
  script: string;
};

export type TextJobInputData = {
  text: string;
  voice_id?: string;
  speed?: number;
};

export type SoundJobInputData = {
  sound_file: string;
};

export type PauseJobInputData = {
  pause_duration: number;
};

export type ScriptParseError = { message: string; index: number };
export type ScriptParseResult =
  | { ok: true; elements: MeditationElement[] }
  | { ok: false; errors: ScriptParseError[] };

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
