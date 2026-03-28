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

export interface FileNameComponents {
  voiceNamePart: string;
  textPart: string;
  timestamp: string;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  voiceName?: string;
}

export interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  category?: string;
  description?: string;
  labels?: Record<string, string>;
  preview_url?: string;
  available_for_tiers?: string[];
  settings?: {
    stability?: number;
    similarity_boost?: number;
  };
}

export interface TTSRequest {
  text: string;
  model_id: string;
  voice_settings: {
    speed: number;
  };
}

export interface GeneratedAudioFile {
  fileName: string;
  filePath: string;
  outputDirectory: string;
}

export interface ElevenLabsRequest {
  id: string | number;
  text: string;
  voiceId: string;
  speed: number;
}

export interface ElevenLabsBatchRow {
  id: string;
  text: string;
  voice_id?: string;
  speed?: string;
}

export interface ElevenLabsGeneratedFile extends GeneratedAudioFile {
  id: string | number;
  text: string;
  voiceId: string;
  voiceName: string;
  speed: number;
}

export interface ElevenLabsGeneratedFileResult {
  id: string | number;
  success: boolean;
  generatedFile?: ElevenLabsGeneratedFile;
  error?: string;
}

export interface ElevenLabsBatchResult {
  success: boolean;
  successCount: number;
  failureCount: number;
  results: ElevenLabsGeneratedFileResult[];
}

export interface ElevenLabsBatchProcessOptions {
  requests: ElevenLabsRequest[];
  outputDirectory?: string;
  defaultVoiceId?: string;
  defaultSpeed?: number;
}

export interface AudioSequenceStep {
  id: string;
  audio_file_name_and_path?: string;
  pause_duration?: number;
}

export interface AudioWorkflowInputStep {
  id: string | number;
  audioFilePath?: string;
  pauseDuration?: number;
}

export interface AudioProcessingResult {
  outputPath: string;
  audioLengthSeconds: number;
}

export interface GeneratedMeditationAudio extends AudioProcessingResult {
  outputFileName: string;
  outputDirectory: string;
}

export interface AudioWorkflowResult {
  success: boolean;
  generatedAudio?: GeneratedMeditationAudio;
  error?: string;
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
