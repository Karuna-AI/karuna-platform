import { useState, useCallback, useEffect, useRef } from 'react';
import ttsService, { TTSVoiceInfo } from '../services/tts';
import { LanguageCode } from '../i18n/languages';

interface UseTTSOptions {
  autoInitialize?: boolean;
  speechRate?: number;
  /** Language code for TTS - defaults to 'en' */
  language?: LanguageCode;
}

interface UseTTSReturn {
  isSpeaking: boolean;
  isInitialized: boolean;
  error: string | null;
  speak: (text: string, immediate?: boolean) => Promise<void>;
  stop: () => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  setRate: (rate: number) => void;
  setLanguage: (language: LanguageCode) => Promise<void>;
  setVoice: (voiceId: string) => Promise<void>;
  getAvailableVoices: (language?: LanguageCode) => TTSVoiceInfo[];
  currentLanguage: LanguageCode;
}

export function useTTS(options: UseTTSOptions = {}): UseTTSReturn {
  const { autoInitialize = true, speechRate = 0.8, language = 'en' } = options;

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentLanguage, setCurrentLanguage] = useState<LanguageCode>(language);

  const unsubscribeStartRef = useRef<(() => void) | null>(null);
  const unsubscribeFinishRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (autoInitialize) {
      initializeTTS();
    }

    return () => {
      unsubscribeStartRef.current?.();
      unsubscribeFinishRef.current?.();
    };
  }, [autoInitialize]);

  // Update language when prop changes
  useEffect(() => {
    if (isInitialized && language !== currentLanguage) {
      setLanguage(language);
    }
  }, [language, isInitialized]);

  const initializeTTS = async () => {
    try {
      await ttsService.initialize();
      ttsService.setRate(speechRate);

      // Set initial language
      if (language !== 'en') {
        await ttsService.setLanguage(language);
      }
      setCurrentLanguage(ttsService.getCurrentLanguage());

      unsubscribeStartRef.current = ttsService.onSpeakStart(() => {
        setIsSpeaking(true);
      });

      unsubscribeFinishRef.current = ttsService.onSpeakFinish(() => {
        setIsSpeaking(false);
      });

      setIsInitialized(true);
      setError(null);
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : 'Could not initialize text-to-speech';
      setError(errorMessage);
      setIsInitialized(false);
    }
  };

  const speak = useCallback(
    async (text: string, immediate: boolean = false) => {
      if (!isInitialized) {
        await initializeTTS();
      }

      setError(null);

      try {
        await ttsService.speak(text, immediate);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Could not speak the text';
        setError(errorMessage);
      }
    },
    [isInitialized]
  );

  const stop = useCallback(async () => {
    try {
      await ttsService.stop();
      ttsService.clearQueue();
    } catch (err) {
      console.error('Error stopping TTS:', err);
    }
  }, []);

  const pause = useCallback(async () => {
    try {
      await ttsService.pause();
    } catch (err) {
      console.error('Error pausing TTS:', err);
    }
  }, []);

  const resume = useCallback(async () => {
    try {
      await ttsService.resume();
    } catch (err) {
      console.error('Error resuming TTS:', err);
    }
  }, []);

  const setRate = useCallback((rate: number) => {
    ttsService.setRate(rate);
  }, []);

  const setLanguage = useCallback(async (lang: LanguageCode) => {
    try {
      await ttsService.setLanguage(lang);
      setCurrentLanguage(lang);
      setError(null);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : `Could not set language to ${lang}`;
      setError(errorMessage);
    }
  }, []);

  const setVoice = useCallback(async (voiceId: string) => {
    try {
      await ttsService.setVoice(voiceId);
      setError(null);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : `Could not set voice ${voiceId}`;
      setError(errorMessage);
    }
  }, []);

  const getAvailableVoices = useCallback((lang?: LanguageCode): TTSVoiceInfo[] => {
    if (lang) {
      return ttsService.getVoicesForLanguage(lang);
    }
    return ttsService.getAllVoices();
  }, []);

  return {
    isSpeaking,
    isInitialized,
    error,
    speak,
    stop,
    pause,
    resume,
    setRate,
    setLanguage,
    setVoice,
    getAvailableVoices,
    currentLanguage,
  };
}

export default useTTS;
