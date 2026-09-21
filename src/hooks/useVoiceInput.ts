import { useState, useCallback, useRef, useEffect } from 'react';
import { Vibration } from 'react-native';
import voiceRecorder, { AutoStopReason } from '../services/voiceRecorder';
import { transcribeAudio } from '../services/openai';
import { ttsService } from '../services/tts';
import { getCurrentTranslations } from '../i18n/translations';

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
  /** #10: stop after an audio-session interruption, preserving partial audio. */
  salvageRecording: () => Promise<string | null>;
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
    voiceRecorder.initialize().catch(() => {});
    return () => {
      if (isRecording) {
        voiceRecorder.cancelRecording();
      }
    };
  }, [isRecording]);

  const stopRecordingRef = useRef<() => Promise<string | null>>(async () => null);

  /**
   * #29: the recorder stops itself on ~3s of silence or the 60s cap.
   * Silence gets a spoken + visual "I didn't hear you" prompt instead of a
   * useless transcription; a full 60s recording transcribes normally.
   */
  const handleAutoStop = useCallback(async (reason: AutoStopReason) => {
    if (reason === 'silence') {
      await voiceRecorder.cancelRecording();
      setIsRecording(false);
      setRecordingDuration(0);
      recordingPathRef.current = null;
      const message = getCurrentTranslations().chat.silenceNotHeard;
      setError(message);
      onError?.(message);
      ttsService.speak(message).catch(() => {});
    } else {
      await stopRecordingRef.current();
    }
  }, [onError]);

  const startRecording = useCallback(async () => {
    setError(null);

    try {
      if (enableHaptics) {
        Vibration.vibrate(50);
      }

      const path = await voiceRecorder.startRecording((duration) => {
        setRecordingDuration(duration);
      }, handleAutoStop);

      recordingPathRef.current = path;
      setIsRecording(true);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to start recording';
      setError(errorMessage);
      onError?.(errorMessage);
    }
  }, [enableHaptics, onError, handleAutoStop]);

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
        throw new Error(getCurrentTranslations().chat.recordingTooShort);
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

  // Keep a live ref so the recorder's auto-stop callback never goes stale.
  useEffect(() => {
    stopRecordingRef.current = stopRecording;
  }, [stopRecording]);

  const cancelRecording = useCallback(async () => {
    if (isRecording) {
      await voiceRecorder.cancelRecording();
      setIsRecording(false);
      setRecordingDuration(0);
      recordingPathRef.current = null;
    }
  }, [isRecording]);

  /**
   * #10: called when an audio-session interruption (phone call, etc.) hits
   * mid-recording. Announces what happened and preserves/processes the partial
   * audio instead of discarding it.
   */
  const salvageRecording = useCallback(async (): Promise<string | null> => {
    if (!isRecording) {
      return null;
    }

    setIsRecording(false);
    setIsProcessing(true);
    setError(null);

    const t = getCurrentTranslations();

    try {
      const result = await voiceRecorder.stopRecording();
      recordingPathRef.current = null;

      // Announce the interruption (spoken; the transcript below is visual).
      ttsService.speak(t.chat.recordingInterrupted).catch(() => {});

      if (result.duration < 1000) {
        setIsProcessing(false);
        setRecordingDuration(0);
        return null;
      }

      const transcription = await transcribeAudio(result.path, language);

      setIsProcessing(false);
      setRecordingDuration(0);

      if (transcription && transcription.trim()) {
        onTranscription?.(transcription);
        return transcription;
      }
      return null;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to process recording';
      setError(errorMessage);
      setIsProcessing(false);
      setRecordingDuration(0);
      onError?.(errorMessage);
      return null;
    }
  }, [isRecording, language, onTranscription, onError]);

  return {
    isRecording,
    isProcessing,
    recordingDuration,
    error,
    startRecording,
    stopRecording,
    cancelRecording,
    salvageRecording,
  };
}

export default useVoiceInput;
