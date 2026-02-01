/**
 * Language Service
 * Manages language settings, voice pipeline configuration, and transliteration
 */

import { Platform, NativeModules } from 'react-native';
import * as Localization from 'expo-localization';
import {
  LanguageCode,
  LanguageConfig,
  LANGUAGES,
  getLanguageConfig,
  isRTLLanguage,
  LANGUAGE_GROUPS,
} from '../i18n/languages';

export interface VoicePipelineConfig {
  sttLanguage: string;          // Whisper language code
  ttsVoice: string;             // Selected TTS voice identifier
  ttsLanguage: string;          // TTS language code
  speechRate: number;           // Adjusted speech rate
  supportsTransliteration: boolean;
}

export interface DetectedLanguage {
  code: LanguageCode;
  confidence: number;
  script: string;
}

class LanguageService {
  private currentLanguage: LanguageCode = 'en';
  private availableTTSVoices: string[] = [];
  private voiceCache: Map<LanguageCode, string> = new Map();

  /**
   * Initialize language service with device locale
   */
  async initialize(): Promise<LanguageCode> {
    // Get device locale
    const deviceLocale = Localization.locale || 'en-US';
    const languageCode = this.parseLocaleToLanguageCode(deviceLocale);

    this.currentLanguage = languageCode;

    // Load available TTS voices
    await this.loadAvailableTTSVoices();

    console.debug(`[LanguageService] Initialized with language: ${languageCode}`);
    return languageCode;
  }

  /**
   * Parse device locale to supported language code
   */
  private parseLocaleToLanguageCode(locale: string): LanguageCode {
    // Handle full locale codes (e.g., "en-US", "zh-TW")
    const fullCode = locale.replace('_', '-');
    if (fullCode in LANGUAGES) {
      return fullCode as LanguageCode;
    }

    // Try just the language part (e.g., "en", "hi")
    const languagePart = locale.split(/[-_]/)[0].toLowerCase();
    if (languagePart in LANGUAGES) {
      return languagePart as LanguageCode;
    }

    // Default to English
    return 'en';
  }

  /**
   * Load available TTS voices from the device
   */
  private async loadAvailableTTSVoices(): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        // Web Speech API
        if ('speechSynthesis' in window) {
          // Wait for voices to load
          await new Promise<void>((resolve) => {
            const voices = window.speechSynthesis.getVoices();
            if (voices.length > 0) {
              this.availableTTSVoices = voices.map(v => v.name);
              resolve();
            } else {
              window.speechSynthesis.onvoiceschanged = () => {
                this.availableTTSVoices = window.speechSynthesis.getVoices().map(v => v.name);
                resolve();
              };
            }
          });
        }
      } else {
        // React Native - voices loaded via expo-speech
        // We'll check voice availability when selecting
        this.availableTTSVoices = [];
      }
    } catch (error) {
      console.error('[LanguageService] Error loading TTS voices:', error);
    }
  }

  /**
   * Set current language
   */
  setLanguage(code: LanguageCode): void {
    if (code in LANGUAGES) {
      this.currentLanguage = code;
      console.debug(`[LanguageService] Language set to: ${code}`);
    } else {
      console.warn(`[LanguageService] Unknown language code: ${code}`);
    }
  }

  /**
   * Get current language
   */
  getCurrentLanguage(): LanguageCode {
    return this.currentLanguage;
  }

  /**
   * Get language configuration
   */
  getLanguageConfig(code?: LanguageCode): LanguageConfig {
    return getLanguageConfig(code || this.currentLanguage);
  }

  /**
   * Get voice pipeline configuration for current or specified language
   */
  getVoicePipelineConfig(code?: LanguageCode, baseSpeechRate: number = 0.8): VoicePipelineConfig {
    const langCode = code || this.currentLanguage;
    const config = getLanguageConfig(langCode);

    // Select best available TTS voice
    const ttsVoice = this.selectBestTTSVoice(langCode);

    // Calculate adjusted speech rate
    const adjustedRate = baseSpeechRate * config.voice.speechRateMultiplier;

    return {
      sttLanguage: config.voice.whisperCode,
      ttsVoice,
      ttsLanguage: this.getTTSLanguageCode(langCode),
      speechRate: Math.max(0.5, Math.min(1.5, adjustedRate)),
      supportsTransliteration: config.transliteration.enabled,
    };
  }

  /**
   * Select best available TTS voice for a language
   */
  private selectBestTTSVoice(code: LanguageCode): string {
    // Check cache
    if (this.voiceCache.has(code)) {
      return this.voiceCache.get(code)!;
    }

    const config = getLanguageConfig(code);
    const platform = Platform.OS as 'ios' | 'android' | 'web';
    const preferredVoices = config.voice.ttsVoices[platform] || config.voice.ttsVoices.web;

    // Find first available voice
    for (const voice of preferredVoices) {
      if (this.availableTTSVoices.length === 0 || this.availableTTSVoices.includes(voice)) {
        this.voiceCache.set(code, voice);
        return voice;
      }
    }

    // Return first preferred voice even if not in available list
    const fallbackVoice = preferredVoices[0] || code;
    this.voiceCache.set(code, fallbackVoice);
    return fallbackVoice;
  }

  /**
   * Get TTS language code (may differ from our code)
   */
  private getTTSLanguageCode(code: LanguageCode): string {
    const mapping: Partial<Record<LanguageCode, string>> = {
      'zh': 'zh-CN',
      'zh-TW': 'zh-TW',
      'no': 'nb-NO',
      'tl': 'fil-PH',
    };
    return mapping[code] || code;
  }

  /**
   * Detect language from text
   */
  detectLanguage(text: string): DetectedLanguage {
    // Script-based detection
    const scripts = {
      devanagari: /[\u0900-\u097F]/,
      bengali: /[\u0980-\u09FF]/,
      tamil: /[\u0B80-\u0BFF]/,
      telugu: /[\u0C00-\u0C7F]/,
      gujarati: /[\u0A80-\u0AFF]/,
      kannada: /[\u0C80-\u0CFF]/,
      malayalam: /[\u0D00-\u0D7F]/,
      arabic: /[\u0600-\u06FF]/,
      cyrillic: /[\u0400-\u04FF]/,
      chinese: /[\u4E00-\u9FFF]/,
      japanese: /[\u3040-\u30FF]|[\u4E00-\u9FFF]/,
      korean: /[\uAC00-\uD7AF]|[\u1100-\u11FF]/,
      thai: /[\u0E00-\u0E7F]/,
      hebrew: /[\u0590-\u05FF]/,
    };

    // Count characters in each script
    let maxCount = 0;
    let detectedScript = 'latin';

    for (const [script, regex] of Object.entries(scripts)) {
      const matches = text.match(new RegExp(regex.source, 'g'));
      const count = matches?.length || 0;
      if (count > maxCount) {
        maxCount = count;
        detectedScript = script;
      }
    }

    // Map script to language (primary language for that script)
    const scriptToLanguage: Record<string, LanguageCode> = {
      devanagari: 'hi',
      bengali: 'bn',
      tamil: 'ta',
      telugu: 'te',
      gujarati: 'gu',
      kannada: 'kn',
      malayalam: 'ml',
      arabic: 'ar',
      cyrillic: 'ru',
      chinese: 'zh',
      japanese: 'ja',
      korean: 'ko',
      thai: 'th',
      hebrew: 'he',
      latin: 'en',
    };

    const detectedCode = scriptToLanguage[detectedScript] || 'en';
    const totalChars = text.replace(/\s/g, '').length;
    const confidence = totalChars > 0 ? Math.min(1, maxCount / totalChars + 0.5) : 0.5;

    return {
      code: detectedCode,
      confidence,
      script: detectedScript,
    };
  }

  /**
   * Check if text contains mixed scripts (e.g., Hinglish)
   */
  detectMixedScript(text: string): { isMixed: boolean; scripts: string[] } {
    const hasLatin = /[a-zA-Z]/.test(text);
    const hasDevanagari = /[\u0900-\u097F]/.test(text);
    const hasArabic = /[\u0600-\u06FF]/.test(text);
    const hasChinese = /[\u4E00-\u9FFF]/.test(text);

    const scripts: string[] = [];
    if (hasLatin) scripts.push('latin');
    if (hasDevanagari) scripts.push('devanagari');
    if (hasArabic) scripts.push('arabic');
    if (hasChinese) scripts.push('chinese');

    return {
      isMixed: scripts.length > 1,
      scripts,
    };
  }

  /**
   * Check if language is RTL
   */
  isRTL(code?: LanguageCode): boolean {
    return isRTLLanguage(code || this.currentLanguage);
  }

  /**
   * Get locale settings for current language
   */
  getLocaleSettings(code?: LanguageCode) {
    const config = getLanguageConfig(code || this.currentLanguage);
    return config.locale;
  }

  /**
   * Get language groups for UI organization
   */
  getLanguageGroups() {
    return LANGUAGE_GROUPS;
  }

  /**
   * Get all Indian languages
   */
  getIndianLanguages(): LanguageConfig[] {
    return LANGUAGE_GROUPS.indian.map(code => getLanguageConfig(code));
  }

  /**
   * Format date according to language locale
   */
  formatDate(date: Date, code?: LanguageCode): string {
    const config = getLanguageConfig(code || this.currentLanguage);
    const format = config.locale.dateFormat;

    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = String(date.getFullYear());

    return format
      .replace('DD', day)
      .replace('MM', month)
      .replace('YYYY', year);
  }

  /**
   * Format time according to language locale
   */
  formatTime(date: Date, code?: LanguageCode): string {
    const config = getLanguageConfig(code || this.currentLanguage);
    const is24h = config.locale.timeFormat === '24h';

    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, '0');

    if (is24h) {
      return `${String(hours).padStart(2, '0')}:${minutes}`;
    } else {
      const period = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12 || 12;
      return `${hours}:${minutes} ${period}`;
    }
  }

  /**
   * Get emergency number for current language/region
   */
  getEmergencyNumber(code?: LanguageCode): string {
    const config = getLanguageConfig(code || this.currentLanguage);
    return config.locale.emergencyNumber;
  }
}

export const languageService = new LanguageService();
export default languageService;
