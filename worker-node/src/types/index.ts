// Queue status type
export type QueueStatus =
  | "queued"
  | "started"
  | "elevenlabs"
  | "concatenator"
  | "done";

// Queue record interface (matches database schema)
export interface QueueRecord {
  id?: number;
  userId: number;
  status: QueueStatus;
  jobFilename: string;
  createdAt?: Date;
  updatedAt?: Date;
}

// Meditation request body interface
export interface MeditationRequestBody {
  userId: number;
  filenameCsv?: string;
  meditationArray?: MeditationArrayElement[];
  title?: string;
  description?: string;
}

// Meditation array element (from request body)
export interface MeditationArrayElement {
  id: string | number;
  text?: string;
  voice_id?: string;
  speed?: number | string;
  pause_duration?: number | string;
  sound_file?: string;
}

// ElevenLabs CSV row format
export interface ElevenLabsCsvRow {
  id: string | number;
  text: string;
  voice_id: string;
  speed: string | number;
}

// AudioConcatenator CSV row format
export interface AudioConcatenatorCsvRow {
  id: string | number;
  audio_file_name_and_path: string;
  pause_duration: string | number;
}

// Child process result
export interface ChildProcessResult {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  error?: Error;
}

// Workflow result
export interface WorkflowResult {
  success: boolean;
  queueId: number;
  finalFilePath?: string;
  error?: string;
}
