/**
 * Transliteration Service
 * Handles conversion between scripts (e.g., Hinglish, Romanized Hindi)
 */

import { LanguageCode, getLanguageConfig } from '../i18n/languages';

// Devanagari to Latin transliteration map
const DEVANAGARI_TO_LATIN: Record<string, string> = {
  // Vowels
  'अ': 'a', 'आ': 'aa', 'इ': 'i', 'ई': 'ee', 'उ': 'u', 'ऊ': 'oo',
  'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au', 'अं': 'an', 'अः': 'ah',
  // Vowel marks
  'ा': 'aa', 'ि': 'i', 'ी': 'ee', 'ु': 'u', 'ू': 'oo',
  'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ं': 'n', 'ः': 'h',
  // Consonants
  'क': 'ka', 'ख': 'kha', 'ग': 'ga', 'घ': 'gha', 'ङ': 'nga',
  'च': 'cha', 'छ': 'chha', 'ज': 'ja', 'झ': 'jha', 'ञ': 'nya',
  'ट': 'ta', 'ठ': 'tha', 'ड': 'da', 'ढ': 'dha', 'ण': 'na',
  'त': 'ta', 'थ': 'tha', 'द': 'da', 'ध': 'dha', 'न': 'na',
  'प': 'pa', 'फ': 'pha', 'ब': 'ba', 'भ': 'bha', 'म': 'ma',
  'य': 'ya', 'र': 'ra', 'ल': 'la', 'व': 'va', 'श': 'sha',
  'ष': 'sha', 'स': 'sa', 'ह': 'ha',
  // Special
  'क्ष': 'ksha', 'त्र': 'tra', 'ज्ञ': 'gya',
  '्': '', // Halant - removes inherent vowel
  'ऋ': 'ri', 'ॠ': 'ri',
  // Numerals
  '०': '0', '१': '1', '२': '2', '३': '3', '४': '4',
  '५': '5', '६': '6', '७': '7', '८': '8', '९': '9',
};

// Latin to Devanagari transliteration map
const LATIN_TO_DEVANAGARI: Record<string, string> = {
  // Common phonetic mappings
  'a': 'अ', 'aa': 'आ', 'i': 'इ', 'ee': 'ई', 'u': 'उ', 'oo': 'ऊ',
  'e': 'ए', 'ai': 'ऐ', 'o': 'ओ', 'au': 'औ',
  'ka': 'क', 'kha': 'ख', 'ga': 'ग', 'gha': 'घ',
  'cha': 'च', 'chha': 'छ', 'ja': 'ज', 'jha': 'झ',
  'ta': 'त', 'tha': 'थ', 'da': 'द', 'dha': 'ध', 'na': 'न',
  'pa': 'प', 'pha': 'फ', 'ba': 'ब', 'bha': 'भ', 'ma': 'म',
  'ya': 'य', 'ra': 'र', 'la': 'ल', 'va': 'व', 'wa': 'व',
  'sha': 'श', 'sa': 'स', 'ha': 'ह',
  // Common words
  'kya': 'क्या', 'hai': 'है', 'hain': 'हैं', 'ho': 'हो',
  'mein': 'में', 'main': 'मैं', 'aur': 'और', 'ke': 'के',
  'ki': 'की', 'ko': 'को', 'se': 'से', 'ne': 'ने',
  'ka': 'का', 'par': 'पर', 'bhi': 'भी', 'hi': 'ही',
  'nahi': 'नहीं', 'nahin': 'नहीं', 'haan': 'हाँ', 'ji': 'जी',
  'namaste': 'नमस्ते', 'dhanyavaad': 'धन्यवाद',
  'kaise': 'कैसे', 'kaisa': 'कैसा', 'kaisi': 'कैसी',
  'accha': 'अच्छा', 'theek': 'ठीक', 'bahut': 'बहुत',
};

// Arabic script transliteration (basic)
const ARABIC_TO_LATIN: Record<string, string> = {
  'ا': 'a', 'ب': 'b', 'ت': 't', 'ث': 'th', 'ج': 'j',
  'ح': 'h', 'خ': 'kh', 'د': 'd', 'ذ': 'dh', 'ر': 'r',
  'ز': 'z', 'س': 's', 'ش': 'sh', 'ص': 's', 'ض': 'd',
  'ط': 't', 'ظ': 'z', 'ع': 'a', 'غ': 'gh', 'ف': 'f',
  'ق': 'q', 'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n',
  'ه': 'h', 'و': 'w', 'ي': 'y', 'ے': 'e',
  // Urdu specific
  'پ': 'p', 'چ': 'ch', 'ڈ': 'd', 'ڑ': 'r', 'ژ': 'zh',
  'ک': 'k', 'گ': 'g', 'ں': 'n', 'ھ': 'h', 'ء': "'",
};

// Cyrillic to Latin (basic Russian)
const CYRILLIC_TO_LATIN: Record<string, string> = {
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd',
  'е': 'e', 'ё': 'yo', 'ж': 'zh', 'з': 'z', 'и': 'i',
  'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n',
  'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't',
  'у': 'u', 'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch',
  'ш': 'sh', 'щ': 'shch', 'ъ': '', 'ы': 'y', 'ь': '',
  'э': 'e', 'ю': 'yu', 'я': 'ya',
};

export interface TransliterationResult {
  text: string;
  sourceScript: string;
  targetScript: string;
  confidence: number;
}

class TransliterationService {
  /**
   * Transliterate text from one script to another
   */
  transliterate(
    text: string,
    sourceLanguage: LanguageCode,
    targetScript: 'latin' | 'native' = 'latin'
  ): TransliterationResult {
    const config = getLanguageConfig(sourceLanguage);

    if (!config.transliteration.enabled) {
      return {
        text,
        sourceScript: config.script,
        targetScript: config.script,
        confidence: 1,
      };
    }

    if (targetScript === 'latin') {
      return this.transliterateToLatin(text, config.script);
    } else {
      return this.transliterateToNative(text, sourceLanguage);
    }
  }

  /**
   * Transliterate to Latin script
   */
  private transliterateToLatin(text: string, sourceScript: string): TransliterationResult {
    let result = text;
    let charMap: Record<string, string> = {};

    switch (sourceScript) {
      case 'devanagari':
        charMap = DEVANAGARI_TO_LATIN;
        break;
      case 'arabic':
        charMap = ARABIC_TO_LATIN;
        break;
      case 'cyrillic':
        charMap = CYRILLIC_TO_LATIN;
        break;
      default:
        return {
          text,
          sourceScript,
          targetScript: 'latin',
          confidence: 1,
        };
    }

    // Sort by length (longer patterns first)
    const sortedKeys = Object.keys(charMap).sort((a, b) => b.length - a.length);

    for (const char of sortedKeys) {
      result = result.split(char).join(charMap[char]);
    }

    return {
      text: result,
      sourceScript,
      targetScript: 'latin',
      confidence: 0.8,
    };
  }

  /**
   * Transliterate from Latin to native script
   */
  private transliterateToNative(text: string, language: LanguageCode): TransliterationResult {
    const config = getLanguageConfig(language);
    let result = text.toLowerCase();

    if (config.script === 'devanagari') {
      // Sort by length (longer patterns first)
      const sortedKeys = Object.keys(LATIN_TO_DEVANAGARI).sort((a, b) => b.length - a.length);

      for (const pattern of sortedKeys) {
        const regex = new RegExp(pattern, 'gi');
        result = result.replace(regex, LATIN_TO_DEVANAGARI[pattern]);
      }
    }

    return {
      text: result,
      sourceScript: 'latin',
      targetScript: config.script,
      confidence: 0.7,
    };
  }

  /**
   * Normalize mixed-script text (Hinglish, etc.)
   * Keeps original text but provides phonetic hints for TTS
   */
  normalizeMixedScript(text: string, language: LanguageCode): {
    normalized: string;
    phoneticHints: string;
    isMixed: boolean;
  } {
    const config = getLanguageConfig(language);

    if (!config.transliteration.mixedScriptPattern) {
      return {
        normalized: text,
        phoneticHints: text,
        isMixed: false,
      };
    }

    // Check if text contains mixed scripts
    const matches = text.match(config.transliteration.mixedScriptPattern);
    if (!matches || matches.length <= 1) {
      return {
        normalized: text,
        phoneticHints: text,
        isMixed: false,
      };
    }

    // Generate phonetic hints for mixed text
    // This helps TTS engines pronounce mixed-script text correctly
    const phoneticHints = this.generatePhoneticHints(text, language);

    return {
      normalized: text,
      phoneticHints,
      isMixed: true,
    };
  }

  /**
   * Generate phonetic hints for TTS
   */
  private generatePhoneticHints(text: string, language: LanguageCode): string {
    const config = getLanguageConfig(language);

    if (config.script === 'devanagari') {
      // For Devanagari-based languages, transliterate English words
      return text.split(/\s+/).map(word => {
        // Check if word is Latin
        if (/^[a-zA-Z]+$/.test(word)) {
          // Keep English words as-is (TTS will handle them)
          return word;
        }
        return word;
      }).join(' ');
    }

    return text;
  }

  /**
   * Detect if text needs transliteration for STT
   */
  needsTransliterationHint(text: string, expectedLanguage: LanguageCode): boolean {
    const config = getLanguageConfig(expectedLanguage);

    if (!config.transliteration.supportsLatinInput) {
      return false;
    }

    // Check if text is in Latin but expected language uses different script
    const isLatin = /^[a-zA-Z\s.,!?'"-]+$/.test(text);
    const expectedScript = config.script;

    return isLatin && expectedScript !== 'latin';
  }

  /**
   * Get common greeting in a language (for TTS testing)
   */
  getGreeting(language: LanguageCode): string {
    const greetings: Partial<Record<LanguageCode, string>> = {
      en: 'Hello! How can I help you today?',
      hi: 'नमस्ते! मैं आपकी कैसे मदद कर सकती हूं?',
      mr: 'नमस्कार! मी तुम्हाला कशी मदत करू शकते?',
      bn: 'নমস্কার! আমি কিভাবে আপনাকে সাহায্য করতে পারি?',
      ta: 'வணக்கம்! நான் உங்களுக்கு எப்படி உதவ முடியும்?',
      te: 'నమస్కారం! నేను మీకు ఎలా సహాయం చేయగలను?',
      gu: 'નમસ્તે! હું તમને કેવી રીતે મદદ કરી શકું?',
      es: '¡Hola! ¿Cómo puedo ayudarte hoy?',
      fr: 'Bonjour! Comment puis-je vous aider?',
      de: 'Hallo! Wie kann ich Ihnen helfen?',
      zh: '您好！我能帮您什么忙？',
      ja: 'こんにちは！何かお手伝いできますか？',
      ko: '안녕하세요! 무엇을 도와드릴까요?',
      ar: 'مرحباً! كيف يمكنني مساعدتك؟',
      ru: 'Здравствуйте! Чем я могу вам помочь?',
    };

    return greetings[language] || greetings.en!;
  }

  /**
   * Get language-specific number pronunciation
   */
  formatNumberForSpeech(number: number, language: LanguageCode): string {
    const config = getLanguageConfig(language);

    // For Indian languages, use Indian numbering system for large numbers
    if (config.locale.currency === 'INR' && number >= 100000) {
      // Convert to lakhs and crores
      if (number >= 10000000) {
        const crores = number / 10000000;
        return `${crores.toFixed(2)} crore`;
      } else if (number >= 100000) {
        const lakhs = number / 100000;
        return `${lakhs.toFixed(2)} lakh`;
      }
    }

    return number.toLocaleString(language);
  }
}

export const transliterationService = new TransliterationService();
export default transliterationService;
