import React, {
  createContext,
  useContext,
  useCallback,
  useState,
  ReactNode,
  useEffect,
} from 'react';
import { Message, ParsedIntent } from '../types';
import { useChat } from '../hooks/useChat';
import { useTTS } from '../hooks/useTTS';
import { useVoiceInput } from '../hooks/useVoiceInput';
import { useSettings } from './SettingsContext';
import { audioSessionService } from '../services/audioSession';
import { RecordingException } from '../services/voiceRecorder';
import { permissionsService } from '../services/permissions';
import { getLanguageConfig } from '../i18n/languages';

interface ChatContextValue {
  // State
  messages: Message[];
  isLoading: boolean;
  isLoadingHistory: boolean;
  isRecording: boolean;
  isProcessing: boolean;
  isSpeaking: boolean;
  error: string | null;
  recordingDuration: number;

  // Transcript editing
  pendingTranscript: string | null;
  isPendingTranscriptVisible: boolean;

  // Permission state
  permissionBlocked: boolean;

  // Actions
  sendMessage: (text: string) => Promise<void>;
  startRecording: () => Promise<void>;
  stopRecordingAndSend: () => Promise<void>;
  stopRecordingForEdit: () => Promise<void>;
  cancelRecording: () => Promise<void>;
  stopSpeaking: () => Promise<void>;
  clearMessages: () => void;
  retryLastMessage: () => Promise<void>;

  // Transcript editing actions
  confirmTranscript: () => Promise<void>;
  editTranscript: (newText: string) => void;
  dismissTranscript: () => void;

  // Permission actions
  openSettings: () => Promise<void>;
  clearError: () => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

interface ChatProviderProps {
  children: ReactNode;
  onIntentDetected?: (intent: ParsedIntent) => void;
}

export function ChatProvider({
  children,
  onIntentDetected,
}: ChatProviderProps): JSX.Element {
  const { settings } = useSettings();
  const [currentError, setCurrentError] = useState<string | null>(null);
  const [pendingTranscript, setPendingTranscript] = useState<string | null>(null);
  const [isPendingTranscriptVisible, setIsPendingTranscriptVisible] = useState(false);
  const [permissionBlocked, setPermissionBlocked] = useState(false);

  // Get language config for voice pipeline settings
  const languageConfig = getLanguageConfig(settings.language);

  // Initialize TTS with current language
  const { speak, stop: stopTTS, isSpeaking, setLanguage: setTTSLanguage } = useTTS({
    autoInitialize: true,
    speechRate: settings.speechRate,
    language: settings.language,
  });

  // Update TTS language when settings change
  useEffect(() => {
    setTTSLanguage(settings.language);
  }, [settings.language, setTTSLanguage]);

  // Initialize audio session manager
  useEffect(() => {
    audioSessionService.initialize({
      onInterruptionBegan: () => {
        // Stop recording if interrupted (phone call, etc.)
        if (isRecording) {
          cancelRecording();
        }
      },
      onInterruptionEnded: () => {
        // Could auto-resume or just let user restart
      },
      onAppBackground: () => {
        // Stop recording when app goes to background
        if (isRecording) {
          cancelRecording();
        }
      },
    });

    return () => {
      audioSessionService.cleanup();
    };
  }, []);

  const handleResponse = useCallback(
    (response: string) => {
      speak(response, true);
    },
    [speak]
  );

  const handleError = useCallback((error: string) => {
    setCurrentError(error);
  }, []);

  const {
    messages,
    isLoading,
    isLoadingHistory,
    error: chatError,
    sendMessage: sendChatMessage,
    clearMessages,
    retryLastMessage,
  } = useChat({
    onResponse: handleResponse,
    onError: handleError,
    onIntentDetected,
  });

  const handleTranscription = useCallback((text: string) => {
    // Don't auto-send - show for editing first
    if (text.trim()) {
      setPendingTranscript(text.trim());
      setIsPendingTranscriptVisible(true);
    }
  }, []);

  const handleVoiceError = useCallback((error: string) => {
    setCurrentError(error);
  }, []);

  // Initialize voice input with current language for STT (Whisper language hint)
  const {
    isRecording,
    isProcessing,
    recordingDuration,
    error: voiceError,
    startRecording: startVoiceRecording,
    stopRecording: stopVoiceRecording,
    cancelRecording: cancelVoiceRecording,
  } = useVoiceInput({
    onTranscription: handleTranscription,
    onError: handleVoiceError,
    enableHaptics: settings.hapticFeedback,
    language: languageConfig.voice.whisperCode, // Pass Whisper language code for STT
  });

  // Track recording state for audio session
  useEffect(() => {
    audioSessionService.setRecordingActive(isRecording);
  }, [isRecording]);

  // Track speaking state for audio session
  useEffect(() => {
    audioSessionService.setSpeakingActive(isSpeaking);
  }, [isSpeaking]);

  const startRecording = useCallback(async () => {
    setCurrentError(null);
    setPermissionBlocked(false);

    try {
      await startVoiceRecording();
    } catch (error) {
      if (error instanceof RecordingException) {
        if (error.type === 'permission_blocked') {
          setPermissionBlocked(true);
          permissionsService.showPermissionBlockedAlert();
        } else if (error.type === 'permission_denied' && error.canRetry) {
          permissionsService.showPermissionDeniedAlert(() => startRecording());
        }
      }
      throw error;
    }
  }, [startVoiceRecording]);

  // Stop recording and send immediately (old behavior)
  const stopRecordingAndSend = useCallback(async () => {
    const transcription = await stopVoiceRecording();
    if (transcription) {
      await sendChatMessage(transcription);
    }
  }, [stopVoiceRecording, sendChatMessage]);

  // Stop recording and show transcript for editing (new behavior)
  const stopRecordingForEdit = useCallback(async () => {
    const transcription = await stopVoiceRecording();
    if (transcription) {
      setPendingTranscript(transcription);
      setIsPendingTranscriptVisible(true);
    }
  }, [stopVoiceRecording]);

  const cancelRecording = useCallback(async () => {
    await cancelVoiceRecording();
    setCurrentError(null);
  }, [cancelVoiceRecording]);

  const stopSpeaking = useCallback(async () => {
    await stopTTS();
  }, [stopTTS]);

  // Transcript editing functions
  const confirmTranscript = useCallback(async () => {
    if (pendingTranscript) {
      await sendChatMessage(pendingTranscript);
      setPendingTranscript(null);
      setIsPendingTranscriptVisible(false);
    }
  }, [pendingTranscript, sendChatMessage]);

  const editTranscript = useCallback((newText: string) => {
    setPendingTranscript(newText);
  }, []);

  const dismissTranscript = useCallback(() => {
    setPendingTranscript(null);
    setIsPendingTranscriptVisible(false);
  }, []);

  const openSettings = useCallback(async () => {
    await permissionsService.openSettings();
  }, []);

  const clearError = useCallback(() => {
    setCurrentError(null);
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    await sendChatMessage(text);
  }, [sendChatMessage]);

  const error = currentError || chatError || voiceError;

  const value: ChatContextValue = {
    // State
    messages,
    isLoading,
    isLoadingHistory,
    isRecording,
    isProcessing,
    isSpeaking,
    error,
    recordingDuration,

    // Transcript editing
    pendingTranscript,
    isPendingTranscriptVisible,

    // Permission state
    permissionBlocked,

    // Actions
    sendMessage,
    startRecording,
    stopRecordingAndSend,
    stopRecordingForEdit,
    cancelRecording,
    stopSpeaking,
    clearMessages,
    retryLastMessage,

    // Transcript editing actions
    confirmTranscript,
    editTranscript,
    dismissTranscript,

    // Permission actions
    openSettings,
    clearError,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChatContext(): ChatContextValue {
  const context = useContext(ChatContext);

  if (!context) {
    throw new Error('useChatContext must be used within a ChatProvider');
  }

  return context;
}

export default ChatContext;
