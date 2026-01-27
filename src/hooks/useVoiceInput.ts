import { useState, useCallback, useRef, useEffect } from 'react';
import { Vibration } from 'react-native';
import voiceRecorder from '../services/voiceRecorder';
import { transcribeAudio } from '../services/openai';

interface UseVoiceInputOptions {
  onTranscription?: (text: string) => void;
  onError?: (error: string) => void;
  enableHaptics?: boolean;
  /** Language code for STT (Whisper language hint) - defaults to 'en' */
  language?: string;
}

interface UseVoiceInputReturn {
  isRecording: boolean;
  isProcessing: boolean;
  recordingDuration: number;
  error: string | null;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<string | null>;
  cancelRecording: () => Promise<void>;
}

export function useVoiceInput(
  options: UseVoiceInputOptions = {}
): UseVoiceInputReturn {
  const { onTranscription, onError, enableHaptics = true, language = 'en' } = options;

  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recordingPathRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (isRecording) {
        voiceRecorder.cancelRecording();
      }
    };
  }, [isRecording]);

  const startRecording = useCallback(async () => {
    setError(null);

    try {
      if (enableHaptics) {
        Vibration.vibrate(50);
      }

      const path = await voiceRecorder.startRecording((duration) => {
        setRecordingDuration(duration);
      });

      recordingPathRef.current = path;
      setIsRecording(true);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to start recording';
      setError(errorMessage);
      onError?.(errorMessage);
    }
  }, [enableHaptics, onError]);

  const stopRecording = useCallback(async (): Promise<string | null> => {
    if (!isRecording) {
      return null;
    }

    setIsRecording(false);
    setIsProcessing(true);
    setError(null);

    try {
      if (enableHaptics) {
        Vibration.vibrate(50);
      }

      const { path, duration } = await voiceRecorder.stopRecording();

      if (duration < 500) {
        throw new Error('Recording too short. Please hold and speak.');
      }

      // Pass language hint to Whisper for improved accuracy
      const transcription = await transcribeAudio(path, language);

      setIsProcessing(false);
      setRecordingDuration(0);
      onTranscription?.(transcription);

      return transcription;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to process recording';
      setError(errorMessage);
      setIsProcessing(false);
      setRecordingDuration(0);
      onError?.(errorMessage);

      return null;
    }
  }, [isRecording, enableHaptics, language, onTranscription, onError]);

  const cancelRecording = useCallback(async () => {
    if (isRecording) {
      await voiceRecorder.cancelRecording();
      setIsRecording(false);
      setRecordingDuration(0);
      recordingPathRef.current = null;
    }
  }, [isRecording]);

  return {
    isRecording,
    isProcessing,
    recordingDuration,
    error,
    startRecording,
    stopRecording,
    cancelRecording,
  };
}

export default useVoiceInput;
