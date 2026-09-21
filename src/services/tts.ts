import * as Speech from 'expo-speech';
import { Platform } from 'react-native';
import { languageService } from './languageService';
import { LanguageCode, getLanguageConfig } from '../i18n/languages';
import { getCurrentTranslations } from '../i18n/translations';

type TTSEventCallback = () => void;
type TTSErrorCallback = (message: string) => void;

export interface TTSVoiceInfo {
  id: string;
  name: string;
  language: string;
  quality: number;
}

/** Thrown/surfaced when the native TTS engine fails to speak. */
export class TTSException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TTSException';
  }
}

/** #32: long replies are spoken sentence-by-sentence in chunks this size. */
const SPEECH_CHUNK_MAX_CHARS = 280;
const SPEECH_MAX_CHUNKS = 20;

class TextToSpeechService {
  private isInitialized: boolean = false;
  private isSpeaking: boolean = false;
  private speechQueue: string[] = [];
  private onSpeakStartCallbacks: TTSEventCallback[] = [];
  private onSpeakFinishCallbacks: TTSEventCallback[] = [];
  private onSpeakErrorCallbacks: TTSErrorCallback[] = [];
  private availableVoices: Speech.Voice[] = [];
  private currentLanguage: LanguageCode = 'en';
  private currentVoiceId: string | null = null;
  // #31: slower default on Android for elderly listeners.
  private currentRate: number = Platform.OS === 'ios' ? 0.45 : 0.6;
  /** Explicit user choice via setRate — survives language changes. */
  private userRateOverride: number | null = null;
  private currentPitch: number = 1.0;
  /**
   * #30: deferred for the in-flight utterance. expo-speech is fire-and-forget,
   * so async native onError/onDone settle this — the speak() Promise genuinely
   * rejects instead of only firing callbacks after it returned.
   */
  private pendingUtterance: {
    resolve: () => void;
    reject: (error: Error) => void;
  } | null = null;

  /** Settle (resolve) any in-flight utterance without error. */
  private settlePendingUtterance(): void {
    if (this.pendingUtterance) {
      const pending = this.pendingUtterance;
      this.pendingUtterance = null;
      pending.resolve();
    }
  }

  /** Fail the in-flight utterance: reject its Promise and notify subscribers. */
  private failPendingUtterance(error: Error): void {
    if (this.pendingUtterance) {
      const pending = this.pendingUtterance;
      this.pendingUtterance = null;
      pending.reject(error);
    }
  }

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

      // Apply speech rate multiplier for this language, unless the user
      // explicitly chose a speed (onboarding / Settings) — #31.
      const baseRate = Platform.OS === 'ios' ? 0.45 : 0.6;
      this.currentRate = this.userRateOverride ?? baseRate * config.voice.speechRateMultiplier;

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

  /**
   * #32: split a long reply into sentence-sized chunks so speech stays
   * natural and Stop still halts everything (the queue is cleared on stop).
   */
  private chunkForSpeech(text: string): string[] {
    const clean = text.trim().replace(/\s+/g, ' ');
    if (clean.length <= SPEECH_CHUNK_MAX_CHARS) {
      return [clean];
    }

    // Sentence split without lookbehind (older Hermes compat).
    const sentences: string[] = [];
    const sentenceRe = /[^.!?…]+[.!?…]+["'”’)]?/g;
    let match: RegExpExecArray | null;
    let lastIndex = 0;
    while ((match = sentenceRe.exec(clean)) !== null) {
      sentences.push(match[0].trim());
      lastIndex = match.index + match[0].length;
    }
    const tail = clean.slice(lastIndex).trim();
    if (tail) {
      sentences.push(tail);
    }
    const units = sentences.length > 0 ? sentences : [clean];

    const chunks: string[] = [];
    let current = '';
    for (const unit of units) {
      const candidate = current ? `${current} ${unit}` : unit;
      if (candidate.length > SPEECH_CHUNK_MAX_CHARS && current) {
        chunks.push(current);
        current = unit;
      } else {
        current = candidate;
      }
      if (chunks.length >= SPEECH_MAX_CHUNKS) {
        break;
      }
    }
    if (current && chunks.length < SPEECH_MAX_CHUNKS) {
      chunks.push(current);
    }
    return chunks.length > 0 ? chunks : [clean];
  }

  /** #30: surface TTS failures with a friendly translated message. */
  private notifySpeakError(): string {
    const message = getCurrentTranslations().errors.ttsFailed;
    console.error('[TTS] Speech error — surfacing to UI:', message);
    this.isSpeaking = false;
    this.onSpeakErrorCallbacks.forEach(cb => {
      try {
        cb(message);
      } catch {
        /* intentionally empty */
      }
    });
    this.onSpeakFinishCallbacks.forEach(cb => cb());
    // Keep the remaining queue moving so one bad chunk doesn't wedge speech.
    this.processQueue().catch(() => {});
    return message;
  }

  async speak(text: string, immediate: boolean = false): Promise<void> {
    if (!text || !text.trim()) {
      return;
    }

    if (!this.isInitialized) {
      try {
        await this.initialize();
      } catch (error) {
        console.error('TTS initialization failed during speak:', error);
        throw new TTSException(this.notifySpeakError());
      }
    }

    if (immediate) {
      await this.stop();
      this.speechQueue = [];
    }

    // #32: long replies are queued sentence-by-sentence.
    const chunks = this.chunkForSpeech(text);

    if (this.isSpeaking && !immediate) {
      this.speechQueue.push(...chunks);
      return;
    }

    const [firstChunk, ...restChunks] = chunks;
    // Remaining chunks wait their turn; stop() clears them all.
    this.speechQueue.unshift(...restChunks);

    // #30: the returned Promise settles when this utterance settles — an
    // async native onError rejects it (previously it only fired callbacks
    // after speak() had already returned).
    let resolveUtterance!: () => void;
    let rejectUtterance!: (error: Error) => void;
    const utteranceDone = new Promise<void>((resolve, reject) => {
      resolveUtterance = resolve;
      rejectUtterance = reject;
    });
    // A stale pending utterance (e.g. interrupted) must not hang forever.
    this.settlePendingUtterance();
    this.pendingUtterance = { resolve: resolveUtterance, reject: rejectUtterance };

    const handleDone = () => {
      this.isSpeaking = false;
      this.settlePendingUtterance();
      this.onSpeakFinishCallbacks.forEach((cb) => cb());
      this.processQueue();
    };
    const handleError = () => {
      const message = this.notifySpeakError();
      this.failPendingUtterance(new TTSException(message));
    };

    try {
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && window.speechSynthesis) {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(firstChunk);
          utterance.lang = this.currentLanguage;
          utterance.onstart = () => {
            this.isSpeaking = true;
            this.onSpeakStartCallbacks.forEach((cb) => cb());
          };
          utterance.onend = handleDone;
          utterance.onerror = handleError;
          window.speechSynthesis.speak(utterance);
        } else {
          this.settlePendingUtterance();
        }
        return utteranceDone;
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
        onDone: handleDone,
        onStopped: () => {
          this.isSpeaking = false;
          this.settlePendingUtterance();
          this.onSpeakFinishCallbacks.forEach((cb) => cb());
        },
        onError: handleError,
      };

      if (this.currentVoiceId) {
        options.voice = this.currentVoiceId;
      }

      Speech.speak(firstChunk, options);
      return utteranceDone;
    } catch (error) {
      console.error('TTS speak error:', error);
      const message = this.notifySpeakError();
      this.failPendingUtterance(new TTSException(message));
      throw new TTSException(message);
    }
  }

  private async processQueue(): Promise<void> {
    if (this.speechQueue.length > 0 && !this.isSpeaking) {
      const nextText = this.speechQueue.shift();
      if (nextText) {
        try {
          await this.speak(nextText);
        } catch {
          // Error already surfaced via notifySpeakError; keep draining.
          await this.processQueue();
        }
      }
    }
  }

  async stop(): Promise<void> {
    try {
      // Clear the queue to prevent pending items from speaking
      this.speechQueue = [];
      // #30: don't leave speak() callers hanging on a stopped utterance.
      this.settlePendingUtterance();
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
    const clamped = Math.max(0.1, Math.min(2.0, rate));
    this.userRateOverride = clamped;
    this.currentRate = clamped;
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

  /**
   * #30: subscribe to TTS engine failures. The message is the translated
   * "Sorry, I couldn't speak that. Try again." — hook it into UI error state.
   */
  onSpeakError(callback: TTSErrorCallback): () => void {
    this.onSpeakErrorCallbacks.push(callback);
    return () => {
      this.onSpeakErrorCallbacks = this.onSpeakErrorCallbacks.filter(
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
