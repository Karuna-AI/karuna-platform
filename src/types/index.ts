export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export interface ChatState {
  messages: Message[];
  isLoading: boolean;
  isRecording: boolean;
  isSpeaking: boolean;
  error: string | null;
}

export interface OpenAIMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface WhisperResponse {
  text: string;
}

export interface ChatCompletionResponse {
  id: string;
  choices: {
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }[];
}

export type IntentType =
  | 'call'
  | 'reminder'
  | 'message'
  | 'question'
  | 'help'
  | 'unknown'
  // Phase 13: Actions Layer Expansion
  | 'ride_request'      // Uber, Ola, Lyft
  | 'navigation'        // Maps, directions
  | 'youtube'           // YouTube search/play
  | 'music'             // Spotify, music playback
  | 'otp_help'          // OTP assistance
  | 'emergency'         // Emergency call
  | 'whatsapp';         // WhatsApp specific

export interface ParsedIntent {
  type: IntentType;
  confidence: number;
  entities: {
    contact?: string;
    time?: string;
    message?: string;
    // Phase 13: Extended entities
    destination?: string;        // For rides and navigation
    pickup?: string;             // For rides
    rideProvider?: 'uber' | 'ola' | 'lyft';
    query?: string;              // For search (YouTube, music)
    artist?: string;             // For music
    song?: string;               // For music
    otpSource?: string;          // OTP source (bank, app name)
    [key: string]: string | undefined;
  };
  rawText: string;
}

export interface VoiceRecordingState {
  isRecording: boolean;
  recordingPath: string | null;
  duration: number;
  error: string | null;
}

export interface TTSState {
  isSpeaking: boolean;
  isPaused: boolean;
  queue: string[];
}

export interface AccessibilityConfig {
  fontSize: 'normal' | 'large' | 'extraLarge';
  highContrast: boolean;
  speechRate: number;
}

export const ACCESSIBILITY_DEFAULTS: AccessibilityConfig = {
  fontSize: 'large',
  highContrast: true,
  speechRate: 0.8,
};

// Re-export vault types
export * from './vault';
