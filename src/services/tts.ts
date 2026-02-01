import Tts, { Voice } from 'react-native-tts';
import { Platform } from 'react-native';
import { languageService } from './languageService';
import { LanguageCode, getLanguageConfig } from '../i18n/languages';

type TTSEventCallback = () => void;

export interface TTSVoiceInfo {
  id: string;
  name: string;
  language: string;
  quality: number;
}

class TextToSpeechService {
  private isInitialized: boolean = false;
  private isSpeaking: boolean = false;
  private speechQueue: string[] = [];
  private onSpeakStartCallbacks: TTSEventCallback[] = [];
  private onSpeakFinishCallbacks: TTSEventCallback[] = [];
  private availableVoices: Voice[] = [];
  private currentLanguage: LanguageCode = 'en';
  private currentVoiceId: string | null = null;

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      if (Platform.OS === 'web') {
        // react-native-tts is not available on web; use Web Speech API fallback
        this.isInitialized = true;
        console.debug('[TTS] Web platform - using Web Speech API fallback');
        return;
      }

      await Tts.getInitStatus();

      // Load available voices for language selection
      await this.loadAvailableVoices();

      Tts.setDefaultRate(Platform.OS === 'ios' ? 0.45 : 0.8);
      Tts.setDefaultPitch(1.0);

      // Set initial language based on device locale
      const deviceLanguage = languageService.getCurrentLanguage();
      await this.setLanguage(deviceLanguage);

      Tts.addEventListener('tts-start', () => {
        this.isSpeaking = true;
        this.onSpeakStartCallbacks.forEach((cb) => cb());
      });

      Tts.addEventListener('tts-finish', () => {
        this.isSpeaking = false;
        this.onSpeakFinishCallbacks.forEach((cb) => cb());
        this.processQueue();
      });

      Tts.addEventListener('tts-cancel', () => {
        this.isSpeaking = false;
        this.onSpeakFinishCallbacks.forEach((cb) => cb());
      });

      this.isInitialized = true;
      console.debug(`[TTS] Initialized with language: ${deviceLanguage}`);
    } catch (error) {
      console.error('TTS initialization error:', error);

      if (Platform.OS === 'android') {
        try {
          await Tts.requestInstallEngine();
        } catch (installError) {
          console.error('TTS engine install error:', installError);
          throw new Error(
            'Text-to-speech is not available. Please install a TTS engine.'
          );
        }
      }

      throw new Error('Could not initialize text-to-speech.');
    }
  }

  /**
   * Load available TTS voices from the device
   */
  private async loadAvailableVoices(): Promise<void> {
    try {
      this.availableVoices = await Tts.voices();
      console.debug(`[TTS] Loaded ${this.availableVoices.length} voices`);
    } catch (error) {
      console.error('[TTS] Error loading voices:', error);
      this.availableVoices = [];
    }
  }

  /**
   * Get available voices for a specific language
   */
  getVoicesForLanguage(language: LanguageCode): TTSVoiceInfo[] {
    const config = getLanguageConfig(language);
    const languageCode = language.toLowerCase();

    // Filter voices by language (match beginning of language code)
    return this.availableVoices
      .filter(voice => {
        const voiceLang = voice.language.toLowerCase();
        return voiceLang.startsWith(languageCode) ||
               voiceLang.split('-')[0] === languageCode.split('-')[0];
      })
      .map(voice => ({
        id: voice.id,
        name: voice.name,
        language: voice.language,
        quality: voice.quality,
      }))
      .sort((a, b) => b.quality - a.quality); // Sort by quality (higher first)
  }

  /**
   * Get all available voices
   */
  getAllVoices(): TTSVoiceInfo[] {
    return this.availableVoices.map(voice => ({
      id: voice.id,
      name: voice.name,
      language: voice.language,
      quality: voice.quality,
    }));
  }

  /**
   * Set the TTS language and select best available voice
   */
  async setLanguage(language: LanguageCode): Promise<void> {
    this.currentLanguage = language;
    if (Platform.OS === 'web') return;

    const config = getLanguageConfig(language);
    const pipelineConfig = languageService.getVoicePipelineConfig(language);

    try {
      // Set the language
      await Tts.setDefaultLanguage(pipelineConfig.ttsLanguage);

      // Try to select the best voice for this language
      const preferredVoices = config.voice.ttsVoices[Platform.OS as 'ios' | 'android' | 'web'] ||
                              config.voice.ttsVoices.web;

      // Find first available preferred voice
      for (const preferredVoice of preferredVoices) {
        const matchingVoice = this.availableVoices.find(v =>
          v.id === preferredVoice ||
          v.name === preferredVoice ||
          v.name.toLowerCase().includes(preferredVoice.toLowerCase())
        );

        if (matchingVoice) {
          await this.setVoice(matchingVoice.id);
          console.debug(`[TTS] Selected voice: ${matchingVoice.name} for ${language}`);
          return;
        }
      }

      // Fallback: find any voice for this language
      const languageVoices = this.getVoicesForLanguage(language);
      if (languageVoices.length > 0) {
        await this.setVoice(languageVoices[0].id);
        console.debug(`[TTS] Using fallback voice: ${languageVoices[0].name} for ${language}`);
      } else {
        console.warn(`[TTS] No voice found for language: ${language}`);
      }

      // Apply speech rate multiplier for this language
      const baseRate = Platform.OS === 'ios' ? 0.45 : 0.8;
      this.setRate(baseRate * config.voice.speechRateMultiplier);

    } catch (error) {
      console.error(`[TTS] Error setting language ${language}:`, error);
    }
  }

  /**
   * Set a specific voice by ID
   */
  async setVoice(voiceId: string): Promise<void> {
    try {
      await Tts.setDefaultVoice(voiceId);
      this.currentVoiceId = voiceId;
    } catch (error) {
      console.error(`[TTS] Error setting voice ${voiceId}:`, error);
    }
  }

  /**
   * Get current language
   */
  getCurrentLanguage(): LanguageCode {
    return this.currentLanguage;
  }

  /**
   * Get current voice ID
   */
  getCurrentVoiceId(): string | null {
    return this.currentVoiceId;
  }

  async speak(text: string, immediate: boolean = false): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (immediate) {
      await this.stop();
      this.speechQueue = [];
    }

    if (this.isSpeaking && !immediate) {
      this.speechQueue.push(text);
      return;
    }

    try {
      if (Platform.OS === 'web') {
        // Use Web Speech API on web
        if (typeof window !== 'undefined' && window.speechSynthesis) {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.lang = this.currentLanguage;
          utterance.onstart = () => {
            this.isSpeaking = true;
            this.onSpeakStartCallbacks.forEach((cb) => cb());
          };
          utterance.onend = () => {
            this.isSpeaking = false;
            this.onSpeakFinishCallbacks.forEach((cb) => cb());
            this.processQueue();
          };
          window.speechSynthesis.speak(utterance);
        }
        return;
      }
      await Tts.speak(text);
    } catch (error) {
      console.error('TTS speak error:', error);
      throw new Error('Could not speak the text. Please try again.');
    }
  }

  private async processQueue(): Promise<void> {
    if (this.speechQueue.length > 0 && !this.isSpeaking) {
      const nextText = this.speechQueue.shift();
      if (nextText) {
        await this.speak(nextText);
      }
    }
  }

  async stop(): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && window.speechSynthesis) {
          window.speechSynthesis.cancel();
        }
        this.isSpeaking = false;
        return;
      }
      await Tts.stop();
      this.isSpeaking = false;
    } catch (error) {
      console.error('TTS stop error:', error);
    }
  }

  async pause(): Promise<void> {
    if (Platform.OS === 'android') {
      console.warn('Pause not supported on Android');
      return;
    }

    try {
      await Tts.pause();
    } catch (error) {
      console.error('TTS pause error:', error);
    }
  }

  async resume(): Promise<void> {
    if (Platform.OS === 'android') {
      console.warn('Resume not supported on Android');
      return;
    }

    try {
      await Tts.resume();
    } catch (error) {
      console.error('TTS resume error:', error);
    }
  }

  setRate(rate: number): void {
    const clampedRate = Math.max(0.1, Math.min(1.0, rate));
    Tts.setDefaultRate(clampedRate);
  }

  setPitch(pitch: number): void {
    const clampedPitch = Math.max(0.5, Math.min(2.0, pitch));
    Tts.setDefaultPitch(clampedPitch);
  }

  onSpeakStart(callback: TTSEventCallback): () => void {
    this.onSpeakStartCallbacks.push(callback);
    return () => {
      this.onSpeakStartCallbacks = this.onSpeakStartCallbacks.filter(
        (cb) => cb !== callback
      );
    };
  }

  onSpeakFinish(callback: TTSEventCallback): () => void {
    this.onSpeakFinishCallbacks.push(callback);
    return () => {
      this.onSpeakFinishCallbacks = this.onSpeakFinishCallbacks.filter(
        (cb) => cb !== callback
      );
    };
  }

  getIsSpeaking(): boolean {
    return this.isSpeaking;
  }

  clearQueue(): void {
    this.speechQueue = [];
  }
}

export const ttsService = new TextToSpeechService();

export default ttsService;
