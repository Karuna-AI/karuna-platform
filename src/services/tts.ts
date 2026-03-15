import * as Speech from 'expo-speech';
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
  private availableVoices: Speech.Voice[] = [];
  private currentLanguage: LanguageCode = 'en';
  private currentVoiceId: string | null = null;
  private currentRate: number = Platform.OS === 'ios' ? 0.45 : 0.8;
  private currentPitch: number = 1.0;

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      if (Platform.OS === 'web') {
        this.isInitialized = true;
        console.debug('[TTS] Web platform - using Web Speech API fallback');
        return;
      }

      // expo-speech doesn't need explicit initialization - it just works
      // Load available voices
      await this.loadAvailableVoices();

      // Set initial language based on device locale
      const deviceLanguage = languageService.getCurrentLanguage();
      await this.setLanguage(deviceLanguage);

      this.isInitialized = true;
      console.debug(`[TTS] Initialized with language: ${deviceLanguage}`);
    } catch (error) {
      console.error('TTS initialization error:', error);
      // Still mark as initialized - expo-speech may work even if voice loading fails
      this.isInitialized = true;
    }
  }

  /**
   * Load available TTS voices from the device
   */
  private async loadAvailableVoices(): Promise<void> {
    try {
      this.availableVoices = await Speech.getAvailableVoicesAsync();
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
    const languageCode = language.toLowerCase();

    return this.availableVoices
      .filter(voice => {
        const voiceLang = voice.language.toLowerCase();
        return voiceLang.startsWith(languageCode) ||
               voiceLang.split('-')[0] === languageCode.split('-')[0];
      })
      .map(voice => ({
        id: voice.identifier,
        name: voice.name,
        language: voice.language,
        quality: voice.quality === Speech.VoiceQuality.Enhanced ? 500 : 300,
      }))
      .sort((a, b) => b.quality - a.quality);
  }

  /**
   * Get all available voices
   */
  getAllVoices(): TTSVoiceInfo[] {
    return this.availableVoices.map(voice => ({
      id: voice.identifier,
      name: voice.name,
      language: voice.language,
      quality: voice.quality === Speech.VoiceQuality.Enhanced ? 500 : 300,
    }));
  }

  /**
   * Set the TTS language and select best available voice
   */
  async setLanguage(language: LanguageCode): Promise<void> {
    this.currentLanguage = language;

    try {
      const config = getLanguageConfig(language);

      // Try to select the best voice for this language
      const preferredVoices = config.voice.ttsVoices[Platform.OS as 'ios' | 'android' | 'web'] ||
                              config.voice.ttsVoices.web;

      // Find first available preferred voice
      for (const preferredVoice of preferredVoices) {
        const matchingVoice = this.availableVoices.find(v =>
          v.identifier === preferredVoice ||
          v.name === preferredVoice ||
          v.name.toLowerCase().includes(preferredVoice.toLowerCase())
        );

        if (matchingVoice) {
          this.currentVoiceId = matchingVoice.identifier;
          console.debug(`[TTS] Selected voice: ${matchingVoice.name} for ${language}`);
          return;
        }
      }

      // Fallback: find any voice for this language
      const languageVoices = this.getVoicesForLanguage(language);
      if (languageVoices.length > 0) {
        this.currentVoiceId = languageVoices[0].id;
        console.debug(`[TTS] Using fallback voice: ${languageVoices[0].name} for ${language}`);
      } else {
        this.currentVoiceId = null;
        console.warn(`[TTS] No voice found for language: ${language}`);
      }

      // Apply speech rate multiplier for this language
      const baseRate = Platform.OS === 'ios' ? 0.45 : 0.8;
      this.currentRate = baseRate * config.voice.speechRateMultiplier;

    } catch (error) {
      console.error(`[TTS] Error setting language ${language}:`, error);
    }
  }

  /**
   * Set a specific voice by ID
   */
  async setVoice(voiceId: string): Promise<void> {
    this.currentVoiceId = voiceId;
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
      try {
        await this.initialize();
      } catch (error) {
        console.error('TTS initialization failed during speak:', error);
        return;
      }
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

      // Use expo-speech for native platforms
      const options: Speech.SpeechOptions = {
        language: this.currentLanguage,
        rate: this.currentRate,
        pitch: this.currentPitch,
        onStart: () => {
          this.isSpeaking = true;
          this.onSpeakStartCallbacks.forEach((cb) => cb());
        },
        onDone: () => {
          this.isSpeaking = false;
          this.onSpeakFinishCallbacks.forEach((cb) => cb());
          this.processQueue();
        },
        onStopped: () => {
          this.isSpeaking = false;
          this.onSpeakFinishCallbacks.forEach((cb) => cb());
        },
        onError: (error) => {
          console.error('[TTS] Speech error:', error);
          this.isSpeaking = false;
          this.onSpeakFinishCallbacks.forEach((cb) => cb());
        },
      };

      if (this.currentVoiceId) {
        options.voice = this.currentVoiceId;
      }

      Speech.speak(text, options);
    } catch (error) {
      console.error('TTS speak error:', error);
      this.isSpeaking = false;
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
      Speech.stop();
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
      Speech.pause();
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
      Speech.resume();
    } catch (error) {
      console.error('TTS resume error:', error);
    }
  }

  setRate(rate: number): void {
    this.currentRate = Math.max(0.1, Math.min(2.0, rate));
  }

  setPitch(pitch: number): void {
    this.currentPitch = Math.max(0.5, Math.min(2.0, pitch));
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
