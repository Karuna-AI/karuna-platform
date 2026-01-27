/**
 * Language Configuration System
 * Supports 50+ languages with voice pipeline configuration
 */

// Supported language codes (ISO 639-1 + region where applicable)
export type LanguageCode =
  // Major world languages
  | 'en'    // English
  | 'hi'    // Hindi
  | 'mr'    // Marathi
  | 'bn'    // Bengali
  | 'ta'    // Tamil
  | 'te'    // Telugu
  | 'gu'    // Gujarati
  | 'kn'    // Kannada
  | 'ml'    // Malayalam
  | 'pa'    // Punjabi
  | 'or'    // Odia
  | 'as'    // Assamese
  | 'ur'    // Urdu
  // European languages
  | 'es'    // Spanish
  | 'fr'    // French
  | 'de'    // German
  | 'it'    // Italian
  | 'pt'    // Portuguese
  | 'ru'    // Russian
  | 'pl'    // Polish
  | 'nl'    // Dutch
  | 'sv'    // Swedish
  | 'no'    // Norwegian
  | 'da'    // Danish
  | 'fi'    // Finnish
  | 'el'    // Greek
  | 'cs'    // Czech
  | 'hu'    // Hungarian
  | 'ro'    // Romanian
  | 'bg'    // Bulgarian
  | 'uk'    // Ukrainian
  | 'sk'    // Slovak
  | 'hr'    // Croatian
  | 'sr'    // Serbian
  | 'sl'    // Slovenian
  | 'lt'    // Lithuanian
  | 'lv'    // Latvian
  | 'et'    // Estonian
  // Asian languages
  | 'zh'    // Chinese (Mandarin)
  | 'zh-TW' // Chinese (Traditional)
  | 'ja'    // Japanese
  | 'ko'    // Korean
  | 'th'    // Thai
  | 'vi'    // Vietnamese
  | 'id'    // Indonesian
  | 'ms'    // Malay
  | 'tl'    // Tagalog/Filipino
  | 'my'    // Burmese
  | 'km'    // Khmer
  // Middle Eastern & African
  | 'ar'    // Arabic
  | 'he'    // Hebrew
  | 'fa'    // Persian/Farsi
  | 'tr'    // Turkish
  | 'sw'    // Swahili
  | 'am'    // Amharic
  | 'af'    // Afrikaans;

export interface LanguageConfig {
  code: LanguageCode;
  name: string;           // English name
  nativeName: string;     // Name in native script
  script: 'latin' | 'devanagari' | 'arabic' | 'cyrillic' | 'chinese' | 'japanese' | 'korean' | 'thai' | 'tamil' | 'telugu' | 'bengali' | 'gujarati' | 'kannada' | 'malayalam' | 'hebrew' | 'other';
  direction: 'ltr' | 'rtl';
  region: string;         // Primary region/country

  // Voice Pipeline Configuration
  voice: {
    // Whisper STT language code (same or mapped)
    whisperCode: string;
    // TTS voice identifiers by platform
    ttsVoices: {
      ios: string[];       // Apple voice identifiers
      android: string[];   // Android TTS voice names
      web: string[];       // Web Speech API voice names
    };
    // Preferred speech rate adjustment for this language
    speechRateMultiplier: number;
  };

  // Transliteration support
  transliteration: {
    enabled: boolean;
    // Map to transliterate to/from Latin
    supportsLatinInput: boolean;
    // Mixed script support (e.g., Hinglish)
    mixedScriptPattern?: RegExp;
  };

  // Locale settings
  locale: {
    dateFormat: string;
    timeFormat: '12h' | '24h';
    numberFormat: 'comma' | 'dot' | 'space';
    currency: string;
    emergencyNumber: string;
  };
}

export const LANGUAGES: Record<LanguageCode, LanguageConfig> = {
  // English
  en: {
    code: 'en',
    name: 'English',
    nativeName: 'English',
    script: 'latin',
    direction: 'ltr',
    region: 'US/UK/IN',
    voice: {
      whisperCode: 'en',
      ttsVoices: {
        ios: ['com.apple.voice.compact.en-US.Samantha', 'com.apple.ttsbundle.Samantha-compact', 'en-US'],
        android: ['en-US-language', 'en-us-x-sfg#female_1-local', 'en-US'],
        web: ['Google US English', 'Microsoft Zira - English (United States)', 'en-US'],
      },
      speechRateMultiplier: 1.0,
    },
    transliteration: {
      enabled: false,
      supportsLatinInput: true,
    },
    locale: {
      dateFormat: 'MM/DD/YYYY',
      timeFormat: '12h',
      numberFormat: 'comma',
      currency: 'USD',
      emergencyNumber: '911',
    },
  },

  // Hindi
  hi: {
    code: 'hi',
    name: 'Hindi',
    nativeName: 'हिन्दी',
    script: 'devanagari',
    direction: 'ltr',
    region: 'India',
    voice: {
      whisperCode: 'hi',
      ttsVoices: {
        ios: ['com.apple.voice.compact.hi-IN.Lekha', 'hi-IN'],
        android: ['hi-IN-language', 'hi-in-x-hid#female_1-local', 'hi-IN'],
        web: ['Google हिन्दी', 'Microsoft Hemant - Hindi (India)', 'hi-IN'],
      },
      speechRateMultiplier: 0.95,
    },
    transliteration: {
      enabled: true,
      supportsLatinInput: true,
      mixedScriptPattern: /[\u0900-\u097F]+|[a-zA-Z]+/g, // Hinglish support
    },
    locale: {
      dateFormat: 'DD/MM/YYYY',
      timeFormat: '12h',
      numberFormat: 'comma',
      currency: 'INR',
      emergencyNumber: '112',
    },
  },

  // Marathi
  mr: {
    code: 'mr',
    name: 'Marathi',
    nativeName: 'मराठी',
    script: 'devanagari',
    direction: 'ltr',
    region: 'India (Maharashtra)',
    voice: {
      whisperCode: 'mr',
      ttsVoices: {
        ios: ['com.apple.voice.compact.mr-IN', 'mr-IN'],
        android: ['mr-IN-language', 'mr-in-x-mra#female_1-local', 'mr-IN'],
        web: ['Google मराठी', 'mr-IN'],
      },
      speechRateMultiplier: 0.95,
    },
    transliteration: {
      enabled: true,
      supportsLatinInput: true,
      mixedScriptPattern: /[\u0900-\u097F]+|[a-zA-Z]+/g,
    },
    locale: {
      dateFormat: 'DD/MM/YYYY',
      timeFormat: '12h',
      numberFormat: 'comma',
      currency: 'INR',
      emergencyNumber: '112',
    },
  },

  // Bengali
  bn: {
    code: 'bn',
    name: 'Bengali',
    nativeName: 'বাংলা',
    script: 'bengali',
    direction: 'ltr',
    region: 'India/Bangladesh',
    voice: {
      whisperCode: 'bn',
      ttsVoices: {
        ios: ['com.apple.voice.compact.bn-IN', 'bn-IN'],
        android: ['bn-IN-language', 'bn-in-x-bng#female_1-local', 'bn-IN'],
        web: ['Google বাংলা', 'bn-IN'],
      },
      speechRateMultiplier: 0.95,
    },
    transliteration: {
      enabled: true,
      supportsLatinInput: true,
    },
    locale: {
      dateFormat: 'DD/MM/YYYY',
      timeFormat: '12h',
      numberFormat: 'comma',
      currency: 'INR',
      emergencyNumber: '112',
    },
  },

  // Tamil
  ta: {
    code: 'ta',
    name: 'Tamil',
    nativeName: 'தமிழ்',
    script: 'tamil',
    direction: 'ltr',
    region: 'India (Tamil Nadu)',
    voice: {
      whisperCode: 'ta',
      ttsVoices: {
        ios: ['com.apple.voice.compact.ta-IN', 'ta-IN'],
        android: ['ta-IN-language', 'ta-in-x-tac#female_1-local', 'ta-IN'],
        web: ['Google தமிழ்', 'ta-IN'],
      },
      speechRateMultiplier: 0.9,
    },
    transliteration: {
      enabled: true,
      supportsLatinInput: true,
    },
    locale: {
      dateFormat: 'DD/MM/YYYY',
      timeFormat: '12h',
      numberFormat: 'comma',
      currency: 'INR',
      emergencyNumber: '112',
    },
  },

  // Telugu
  te: {
    code: 'te',
    name: 'Telugu',
    nativeName: 'తెలుగు',
    script: 'telugu',
    direction: 'ltr',
    region: 'India (Andhra Pradesh/Telangana)',
    voice: {
      whisperCode: 'te',
      ttsVoices: {
        ios: ['com.apple.voice.compact.te-IN', 'te-IN'],
        android: ['te-IN-language', 'te-in-x-ted#female_1-local', 'te-IN'],
        web: ['Google తెలుగు', 'te-IN'],
      },
      speechRateMultiplier: 0.9,
    },
    transliteration: {
      enabled: true,
      supportsLatinInput: true,
    },
    locale: {
      dateFormat: 'DD/MM/YYYY',
      timeFormat: '12h',
      numberFormat: 'comma',
      currency: 'INR',
      emergencyNumber: '112',
    },
  },

  // Gujarati
  gu: {
    code: 'gu',
    name: 'Gujarati',
    nativeName: 'ગુજરાતી',
    script: 'gujarati',
    direction: 'ltr',
    region: 'India (Gujarat)',
    voice: {
      whisperCode: 'gu',
      ttsVoices: {
        ios: ['com.apple.voice.compact.gu-IN', 'gu-IN'],
        android: ['gu-IN-language', 'gu-in-x-guj#female_1-local', 'gu-IN'],
        web: ['Google ગુજરાતી', 'gu-IN'],
      },
      speechRateMultiplier: 0.95,
    },
    transliteration: {
      enabled: true,
      supportsLatinInput: true,
    },
    locale: {
      dateFormat: 'DD/MM/YYYY',
      timeFormat: '12h',
      numberFormat: 'comma',
      currency: 'INR',
      emergencyNumber: '112',
    },
  },

  // Kannada
  kn: {
    code: 'kn',
    name: 'Kannada',
    nativeName: 'ಕನ್ನಡ',
    script: 'kannada',
    direction: 'ltr',
    region: 'India (Karnataka)',
    voice: {
      whisperCode: 'kn',
      ttsVoices: {
        ios: ['com.apple.voice.compact.kn-IN', 'kn-IN'],
        android: ['kn-IN-language', 'kn-in-x-knf#female_1-local', 'kn-IN'],
        web: ['Google ಕನ್ನಡ', 'kn-IN'],
      },
      speechRateMultiplier: 0.9,
    },
    transliteration: {
      enabled: true,
      supportsLatinInput: true,
    },
    locale: {
      dateFormat: 'DD/MM/YYYY',
      timeFormat: '12h',
      numberFormat: 'comma',
      currency: 'INR',
      emergencyNumber: '112',
    },
  },

  // Malayalam
  ml: {
    code: 'ml',
    name: 'Malayalam',
    nativeName: 'മലയാളം',
    script: 'malayalam',
    direction: 'ltr',
    region: 'India (Kerala)',
    voice: {
      whisperCode: 'ml',
      ttsVoices: {
        ios: ['com.apple.voice.compact.ml-IN', 'ml-IN'],
        android: ['ml-IN-language', 'ml-in-x-mlf#female_1-local', 'ml-IN'],
        web: ['Google മലയാളം', 'ml-IN'],
      },
      speechRateMultiplier: 0.85,
    },
    transliteration: {
      enabled: true,
      supportsLatinInput: true,
    },
    locale: {
      dateFormat: 'DD/MM/YYYY',
      timeFormat: '12h',
      numberFormat: 'comma',
      currency: 'INR',
      emergencyNumber: '112',
    },
  },

  // Punjabi
  pa: {
    code: 'pa',
    name: 'Punjabi',
    nativeName: 'ਪੰਜਾਬੀ',
    script: 'other', // Gurmukhi
    direction: 'ltr',
    region: 'India (Punjab)',
    voice: {
      whisperCode: 'pa',
      ttsVoices: {
        ios: ['com.apple.voice.compact.pa-IN', 'pa-IN'],
        android: ['pa-IN-language', 'pa-in-x-pnj#female_1-local', 'pa-IN'],
        web: ['Google ਪੰਜਾਬੀ', 'pa-IN'],
      },
      speechRateMultiplier: 0.95,
    },
    transliteration: {
      enabled: true,
      supportsLatinInput: true,
    },
    locale: {
      dateFormat: 'DD/MM/YYYY',
      timeFormat: '12h',
      numberFormat: 'comma',
      currency: 'INR',
      emergencyNumber: '112',
    },
  },

  // Odia
  or: {
    code: 'or',
    name: 'Odia',
    nativeName: 'ଓଡ଼ିଆ',
    script: 'other',
    direction: 'ltr',
    region: 'India (Odisha)',
    voice: {
      whisperCode: 'or',
      ttsVoices: {
        ios: ['com.apple.voice.compact.or-IN', 'or-IN'],
        android: ['or-IN-language', 'or-IN'],
        web: ['or-IN'],
      },
      speechRateMultiplier: 0.95,
    },
    transliteration: {
      enabled: true,
      supportsLatinInput: true,
    },
    locale: {
      dateFormat: 'DD/MM/YYYY',
      timeFormat: '12h',
      numberFormat: 'comma',
      currency: 'INR',
      emergencyNumber: '112',
    },
  },

  // Assamese
  as: {
    code: 'as',
    name: 'Assamese',
    nativeName: 'অসমীয়া',
    script: 'bengali',
    direction: 'ltr',
    region: 'India (Assam)',
    voice: {
      whisperCode: 'as',
      ttsVoices: {
        ios: ['as-IN'],
        android: ['as-IN'],
        web: ['as-IN'],
      },
      speechRateMultiplier: 0.95,
    },
    transliteration: {
      enabled: true,
      supportsLatinInput: true,
    },
    locale: {
      dateFormat: 'DD/MM/YYYY',
      timeFormat: '12h',
      numberFormat: 'comma',
      currency: 'INR',
      emergencyNumber: '112',
    },
  },

  // Urdu
  ur: {
    code: 'ur',
    name: 'Urdu',
    nativeName: 'اردو',
    script: 'arabic',
    direction: 'rtl',
    region: 'Pakistan/India',
    voice: {
      whisperCode: 'ur',
      ttsVoices: {
        ios: ['com.apple.voice.compact.ur-PK', 'ur-PK'],
        android: ['ur-PK-language', 'ur-pk-x-urf#female_1-local', 'ur-PK'],
        web: ['Google اردو', 'ur-PK'],
      },
      speechRateMultiplier: 0.9,
    },
    transliteration: {
      enabled: true,
      supportsLatinInput: true,
    },
    locale: {
      dateFormat: 'DD/MM/YYYY',
      timeFormat: '12h',
      numberFormat: 'comma',
      currency: 'PKR',
      emergencyNumber: '15',
    },
  },

  // Spanish
  es: {
    code: 'es',
    name: 'Spanish',
    nativeName: 'Español',
    script: 'latin',
    direction: 'ltr',
    region: 'Spain/Latin America',
    voice: {
      whisperCode: 'es',
      ttsVoices: {
        ios: ['com.apple.voice.compact.es-ES.Monica', 'es-ES'],
        android: ['es-ES-language', 'es-es-x-eef#female_1-local', 'es-ES'],
        web: ['Google español', 'Microsoft Helena - Spanish (Spain)', 'es-ES'],
      },
      speechRateMultiplier: 1.0,
    },
    transliteration: {
      enabled: false,
      supportsLatinInput: true,
    },
    locale: {
      dateFormat: 'DD/MM/YYYY',
      timeFormat: '24h',
      numberFormat: 'dot',
      currency: 'EUR',
      emergencyNumber: '112',
    },
  },

  // French
  fr: {
    code: 'fr',
    name: 'French',
    nativeName: 'Français',
    script: 'latin',
    direction: 'ltr',
    region: 'France',
    voice: {
      whisperCode: 'fr',
      ttsVoices: {
        ios: ['com.apple.voice.compact.fr-FR.Thomas', 'fr-FR'],
        android: ['fr-FR-language', 'fr-fr-x-frf#female_1-local', 'fr-FR'],
        web: ['Google français', 'Microsoft Julie - French (France)', 'fr-FR'],
      },
      speechRateMultiplier: 1.0,
    },
    transliteration: {
      enabled: false,
      supportsLatinInput: true,
    },
    locale: {
      dateFormat: 'DD/MM/YYYY',
      timeFormat: '24h',
      numberFormat: 'space',
      currency: 'EUR',
      emergencyNumber: '112',
    },
  },

  // German
  de: {
    code: 'de',
    name: 'German',
    nativeName: 'Deutsch',
    script: 'latin',
    direction: 'ltr',
    region: 'Germany',
    voice: {
      whisperCode: 'de',
      ttsVoices: {
        ios: ['com.apple.voice.compact.de-DE.Anna', 'de-DE'],
        android: ['de-DE-language', 'de-de-x-def#female_1-local', 'de-DE'],
        web: ['Google Deutsch', 'Microsoft Hedda - German (Germany)', 'de-DE'],
      },
      speechRateMultiplier: 1.0,
    },
    transliteration: {
      enabled: false,
      supportsLatinInput: true,
    },
    locale: {
      dateFormat: 'DD.MM.YYYY',
      timeFormat: '24h',
      numberFormat: 'dot',
      currency: 'EUR',
      emergencyNumber: '112',
    },
  },

  // Italian
  it: {
    code: 'it',
    name: 'Italian',
    nativeName: 'Italiano',
    script: 'latin',
    direction: 'ltr',
    region: 'Italy',
    voice: {
      whisperCode: 'it',
      ttsVoices: {
        ios: ['com.apple.voice.compact.it-IT.Alice', 'it-IT'],
        android: ['it-IT-language', 'it-it-x-itf#female_1-local', 'it-IT'],
        web: ['Google italiano', 'Microsoft Elsa - Italian (Italy)', 'it-IT'],
      },
      speechRateMultiplier: 1.0,
    },
    transliteration: {
      enabled: false,
      supportsLatinInput: true,
    },
    locale: {
      dateFormat: 'DD/MM/YYYY',
      timeFormat: '24h',
      numberFormat: 'dot',
      currency: 'EUR',
      emergencyNumber: '112',
    },
  },

  // Portuguese
  pt: {
    code: 'pt',
    name: 'Portuguese',
    nativeName: 'Português',
    script: 'latin',
    direction: 'ltr',
    region: 'Portugal/Brazil',
    voice: {
      whisperCode: 'pt',
      ttsVoices: {
        ios: ['com.apple.voice.compact.pt-BR.Luciana', 'pt-BR'],
        android: ['pt-BR-language', 'pt-br-x-ptb#female_1-local', 'pt-BR'],
        web: ['Google português do Brasil', 'Microsoft Maria - Portuguese (Brazil)', 'pt-BR'],
      },
      speechRateMultiplier: 1.0,
    },
    transliteration: {
      enabled: false,
      supportsLatinInput: true,
    },
    locale: {
      dateFormat: 'DD/MM/YYYY',
      timeFormat: '24h',
      numberFormat: 'dot',
      currency: 'BRL',
      emergencyNumber: '190',
    },
  },

  // Russian
  ru: {
    code: 'ru',
    name: 'Russian',
    nativeName: 'Русский',
    script: 'cyrillic',
    direction: 'ltr',
    region: 'Russia',
    voice: {
      whisperCode: 'ru',
      ttsVoices: {
        ios: ['com.apple.voice.compact.ru-RU.Milena', 'ru-RU'],
        android: ['ru-RU-language', 'ru-ru-x-ruf#female_1-local', 'ru-RU'],
        web: ['Google русский', 'Microsoft Irina - Russian (Russia)', 'ru-RU'],
      },
      speechRateMultiplier: 0.95,
    },
    transliteration: {
      enabled: true,
      supportsLatinInput: true,
    },
    locale: {
      dateFormat: 'DD.MM.YYYY',
      timeFormat: '24h',
      numberFormat: 'space',
      currency: 'RUB',
      emergencyNumber: '112',
    },
  },

  // Polish
  pl: {
    code: 'pl',
    name: 'Polish',
    nativeName: 'Polski',
    script: 'latin',
    direction: 'ltr',
    region: 'Poland',
    voice: {
      whisperCode: 'pl',
      ttsVoices: {
        ios: ['com.apple.voice.compact.pl-PL.Zosia', 'pl-PL'],
        android: ['pl-PL-language', 'pl-pl-x-plf#female_1-local', 'pl-PL'],
        web: ['Google polski', 'Microsoft Paulina - Polish (Poland)', 'pl-PL'],
      },
      speechRateMultiplier: 0.95,
    },
    transliteration: {
      enabled: false,
      supportsLatinInput: true,
    },
    locale: {
      dateFormat: 'DD.MM.YYYY',
      timeFormat: '24h',
      numberFormat: 'space',
      currency: 'PLN',
      emergencyNumber: '112',
    },
  },

  // Dutch
  nl: {
    code: 'nl',
    name: 'Dutch',
    nativeName: 'Nederlands',
    script: 'latin',
    direction: 'ltr',
    region: 'Netherlands',
    voice: {
      whisperCode: 'nl',
      ttsVoices: {
        ios: ['com.apple.voice.compact.nl-NL.Xander', 'nl-NL'],
        android: ['nl-NL-language', 'nl-nl-x-nlf#female_1-local', 'nl-NL'],
        web: ['Google Nederlands', 'Microsoft Frank - Dutch (Netherlands)', 'nl-NL'],
      },
      speechRateMultiplier: 1.0,
    },
    transliteration: {
      enabled: false,
      supportsLatinInput: true,
    },
    locale: {
      dateFormat: 'DD-MM-YYYY',
      timeFormat: '24h',
      numberFormat: 'dot',
      currency: 'EUR',
      emergencyNumber: '112',
    },
  },

  // Swedish
  sv: {
    code: 'sv',
    name: 'Swedish',
    nativeName: 'Svenska',
    script: 'latin',
    direction: 'ltr',
    region: 'Sweden',
    voice: {
      whisperCode: 'sv',
      ttsVoices: {
        ios: ['com.apple.voice.compact.sv-SE.Alva', 'sv-SE'],
        android: ['sv-SE-language', 'sv-SE'],
        web: ['Google svenska', 'sv-SE'],
      },
      speechRateMultiplier: 1.0,
    },
    transliteration: {
      enabled: false,
      supportsLatinInput: true,
    },
    locale: {
      dateFormat: 'YYYY-MM-DD',
      timeFormat: '24h',
      numberFormat: 'space',
      currency: 'SEK',
      emergencyNumber: '112',
    },
  },

  // Norwegian
  no: {
    code: 'no',
    name: 'Norwegian',
    nativeName: 'Norsk',
    script: 'latin',
    direction: 'ltr',
    region: 'Norway',
    voice: {
      whisperCode: 'no',
      ttsVoices: {
        ios: ['com.apple.voice.compact.nb-NO.Nora', 'nb-NO'],
        android: ['nb-NO-language', 'nb-NO'],
        web: ['Google norsk', 'nb-NO'],
      },
      speechRateMultiplier: 1.0,
    },
    transliteration: {
      enabled: false,
      supportsLatinInput: true,
    },
    locale: {
      dateFormat: 'DD.MM.YYYY',
      timeFormat: '24h',
      numberFormat: 'space',
      currency: 'NOK',
      emergencyNumber: '112',
    },
  },

  // Danish
  da: {
    code: 'da',
    name: 'Danish',
    nativeName: 'Dansk',
    script: 'latin',
    direction: 'ltr',
    region: 'Denmark',
    voice: {
      whisperCode: 'da',
      ttsVoices: {
        ios: ['com.apple.voice.compact.da-DK.Sara', 'da-DK'],
        android: ['da-DK-language', 'da-DK'],
        web: ['Google dansk', 'da-DK'],
      },
      speechRateMultiplier: 1.0,
    },
    transliteration: {
      enabled: false,
      supportsLatinInput: true,
    },
    locale: {
      dateFormat: 'DD-MM-YYYY',
      timeFormat: '24h',
      numberFormat: 'dot',
      currency: 'DKK',
      emergencyNumber: '112',
    },
  },

  // Finnish
  fi: {
    code: 'fi',
    name: 'Finnish',
    nativeName: 'Suomi',
    script: 'latin',
    direction: 'ltr',
    region: 'Finland',
    voice: {
      whisperCode: 'fi',
      ttsVoices: {
        ios: ['com.apple.voice.compact.fi-FI.Satu', 'fi-FI'],
        android: ['fi-FI-language', 'fi-FI'],
        web: ['Google suomi', 'fi-FI'],
      },
      speechRateMultiplier: 0.95,
    },
    transliteration: {
      enabled: false,
      supportsLatinInput: true,
    },
    locale: {
      dateFormat: 'DD.MM.YYYY',
      timeFormat: '24h',
      numberFormat: 'space',
      currency: 'EUR',
      emergencyNumber: '112',
    },
  },

  // Greek
  el: {
    code: 'el',
    name: 'Greek',
    nativeName: 'Ελληνικά',
    script: 'other',
    direction: 'ltr',
    region: 'Greece',
    voice: {
      whisperCode: 'el',
      ttsVoices: {
        ios: ['com.apple.voice.compact.el-GR.Melina', 'el-GR'],
        android: ['el-GR-language', 'el-GR'],
        web: ['Google Ελληνικά', 'el-GR'],
      },
      speechRateMultiplier: 0.95,
    },
    transliteration: {
      enabled: true,
      supportsLatinInput: true,
    },
    locale: {
      dateFormat: 'DD/MM/YYYY',
      timeFormat: '24h',
      numberFormat: 'dot',
      currency: 'EUR',
      emergencyNumber: '112',
    },
  },

  // Czech
  cs: {
    code: 'cs',
    name: 'Czech',
    nativeName: 'Čeština',
    script: 'latin',
    direction: 'ltr',
    region: 'Czech Republic',
    voice: {
      whisperCode: 'cs',
      ttsVoices: {
        ios: ['com.apple.voice.compact.cs-CZ.Zuzana', 'cs-CZ'],
        android: ['cs-CZ-language', 'cs-CZ'],
        web: ['Google čeština', 'cs-CZ'],
      },
      speechRateMultiplier: 0.95,
    },
    transliteration: {
      enabled: false,
      supportsLatinInput: true,
    },
    locale: {
      dateFormat: 'DD.MM.YYYY',
      timeFormat: '24h',
      numberFormat: 'space',
      currency: 'CZK',
      emergencyNumber: '112',
    },
  },

  // Hungarian
  hu: {
    code: 'hu',
    name: 'Hungarian',
    nativeName: 'Magyar',
    script: 'latin',
    direction: 'ltr',
    region: 'Hungary',
    voice: {
      whisperCode: 'hu',
      ttsVoices: {
        ios: ['com.apple.voice.compact.hu-HU.Mariska', 'hu-HU'],
        android: ['hu-HU-language', 'hu-HU'],
        web: ['Google magyar', 'hu-HU'],
      },
      speechRateMultiplier: 0.95,
    },
    transliteration: {
      enabled: false,
      supportsLatinInput: true,
    },
    locale: {
      dateFormat: 'YYYY.MM.DD',
      timeFormat: '24h',
      numberFormat: 'space',
      currency: 'HUF',
      emergencyNumber: '112',
    },
  },

  // Romanian
  ro: {
    code: 'ro',
    name: 'Romanian',
    nativeName: 'Română',
    script: 'latin',
    direction: 'ltr',
    region: 'Romania',
    voice: {
      whisperCode: 'ro',
      ttsVoices: {
        ios: ['com.apple.voice.compact.ro-RO.Ioana', 'ro-RO'],
        android: ['ro-RO-language', 'ro-RO'],
        web: ['Google română', 'ro-RO'],
      },
      speechRateMultiplier: 1.0,
    },
    transliteration: {
      enabled: false,
      supportsLatinInput: true,
    },
    locale: {
      dateFormat: 'DD.MM.YYYY',
      timeFormat: '24h',
      numberFormat: 'dot',
      currency: 'RON',
      emergencyNumber: '112',
    },
  },

  // Bulgarian
  bg: {
    code: 'bg',
    name: 'Bulgarian',
    nativeName: 'Български',
    script: 'cyrillic',
    direction: 'ltr',
    region: 'Bulgaria',
    voice: {
      whisperCode: 'bg',
      ttsVoices: {
        ios: ['bg-BG'],
        android: ['bg-BG-language', 'bg-BG'],
        web: ['bg-BG'],
      },
      speechRateMultiplier: 0.95,
    },
    transliteration: {
      enabled: true,
      supportsLatinInput: true,
    },
    locale: {
      dateFormat: 'DD.MM.YYYY',
      timeFormat: '24h',
      numberFormat: 'space',
      currency: 'BGN',
      emergencyNumber: '112',
    },
  },

  // Ukrainian
  uk: {
    code: 'uk',
    name: 'Ukrainian',
    nativeName: 'Українська',
    script: 'cyrillic',
    direction: 'ltr',
    region: 'Ukraine',
    voice: {
      whisperCode: 'uk',
      ttsVoices: {
        ios: ['com.apple.voice.compact.uk-UA', 'uk-UA'],
        android: ['uk-UA-language', 'uk-UA'],
        web: ['Google українська', 'uk-UA'],
      },
      speechRateMultiplier: 0.95,
    },
    transliteration: {
      enabled: true,
      supportsLatinInput: true,
    },
    locale: {
      dateFormat: 'DD.MM.YYYY',
      timeFormat: '24h',
      numberFormat: 'space',
      currency: 'UAH',
      emergencyNumber: '112',
    },
  },

  // Slovak
  sk: {
    code: 'sk',
    name: 'Slovak',
    nativeName: 'Slovenčina',
    script: 'latin',
    direction: 'ltr',
    region: 'Slovakia',
    voice: {
      whisperCode: 'sk',
      ttsVoices: {
        ios: ['com.apple.voice.compact.sk-SK.Laura', 'sk-SK'],
        android: ['sk-SK-language', 'sk-SK'],
        web: ['sk-SK'],
      },
      speechRateMultiplier: 0.95,
    },
    transliteration: {
      enabled: false,
      supportsLatinInput: true,
    },
    locale: {
      dateFormat: 'DD.MM.YYYY',
      timeFormat: '24h',
      numberFormat: 'space',
      currency: 'EUR',
      emergencyNumber: '112',
    },
  },

  // Croatian
  hr: {
    code: 'hr',
    name: 'Croatian',
    nativeName: 'Hrvatski',
    script: 'latin',
    direction: 'ltr',
    region: 'Croatia',
    voice: {
      whisperCode: 'hr',
      ttsVoices: {
        ios: ['hr-HR'],
        android: ['hr-HR-language', 'hr-HR'],
        web: ['hr-HR'],
      },
      speechRateMultiplier: 0.95,
    },
    transliteration: {
      enabled: false,
      supportsLatinInput: true,
    },
    locale: {
      dateFormat: 'DD.MM.YYYY',
      timeFormat: '24h',
      numberFormat: 'dot',
      currency: 'EUR',
      emergencyNumber: '112',
    },
  },

  // Serbian
  sr: {
    code: 'sr',
    name: 'Serbian',
    nativeName: 'Српски',
    script: 'cyrillic',
    direction: 'ltr',
    region: 'Serbia',
    voice: {
      whisperCode: 'sr',
      ttsVoices: {
        ios: ['sr-RS'],
        android: ['sr-RS-language', 'sr-RS'],
        web: ['sr-RS'],
      },
      speechRateMultiplier: 0.95,
    },
    transliteration: {
      enabled: true,
      supportsLatinInput: true,
    },
    locale: {
      dateFormat: 'DD.MM.YYYY',
      timeFormat: '24h',
      numberFormat: 'dot',
      currency: 'RSD',
      emergencyNumber: '112',
    },
  },

  // Slovenian
  sl: {
    code: 'sl',
    name: 'Slovenian',
    nativeName: 'Slovenščina',
    script: 'latin',
    direction: 'ltr',
    region: 'Slovenia',
    voice: {
      whisperCode: 'sl',
      ttsVoices: {
        ios: ['sl-SI'],
        android: ['sl-SI-language', 'sl-SI'],
        web: ['sl-SI'],
      },
      speechRateMultiplier: 0.95,
    },
    transliteration: {
      enabled: false,
      supportsLatinInput: true,
    },
    locale: {
      dateFormat: 'DD.MM.YYYY',
      timeFormat: '24h',
      numberFormat: 'dot',
      currency: 'EUR',
      emergencyNumber: '112',
    },
  },

  // Lithuanian
  lt: {
    code: 'lt',
    name: 'Lithuanian',
    nativeName: 'Lietuvių',
    script: 'latin',
    direction: 'ltr',
    region: 'Lithuania',
    voice: {
      whisperCode: 'lt',
      ttsVoices: {
        ios: ['lt-LT'],
        android: ['lt-LT-language', 'lt-LT'],
        web: ['lt-LT'],
      },
      speechRateMultiplier: 0.95,
    },
    transliteration: {
      enabled: false,
      supportsLatinInput: true,
    },
    locale: {
      dateFormat: 'YYYY-MM-DD',
      timeFormat: '24h',
      numberFormat: 'space',
      currency: 'EUR',
      emergencyNumber: '112',
    },
  },

  // Latvian
  lv: {
    code: 'lv',
    name: 'Latvian',
    nativeName: 'Latviešu',
    script: 'latin',
    direction: 'ltr',
    region: 'Latvia',
    voice: {
      whisperCode: 'lv',
      ttsVoices: {
        ios: ['lv-LV'],
        android: ['lv-LV-language', 'lv-LV'],
        web: ['lv-LV'],
      },
      speechRateMultiplier: 0.95,
    },
    transliteration: {
      enabled: false,
      supportsLatinInput: true,
    },
    locale: {
      dateFormat: 'DD.MM.YYYY',
      timeFormat: '24h',
      numberFormat: 'space',
      currency: 'EUR',
      emergencyNumber: '112',
    },
  },

  // Estonian
  et: {
    code: 'et',
    name: 'Estonian',
    nativeName: 'Eesti',
    script: 'latin',
    direction: 'ltr',
    region: 'Estonia',
    voice: {
      whisperCode: 'et',
      ttsVoices: {
        ios: ['et-EE'],
        android: ['et-EE-language', 'et-EE'],
        web: ['et-EE'],
      },
      speechRateMultiplier: 0.95,
    },
    transliteration: {
      enabled: false,
      supportsLatinInput: true,
    },
    locale: {
      dateFormat: 'DD.MM.YYYY',
      timeFormat: '24h',
      numberFormat: 'space',
      currency: 'EUR',
      emergencyNumber: '112',
    },
  },

  // Chinese (Simplified)
  zh: {
    code: 'zh',
    name: 'Chinese (Simplified)',
    nativeName: '简体中文',
    script: 'chinese',
    direction: 'ltr',
    region: 'China',
    voice: {
      whisperCode: 'zh',
      ttsVoices: {
        ios: ['com.apple.voice.compact.zh-CN.Ting-Ting', 'zh-CN'],
        android: ['zh-CN-language', 'zh-cn-x-ccs#female_1-local', 'zh-CN'],
        web: ['Google 普通话（中国大陆）', 'Microsoft Huihui - Chinese (Simplified, China)', 'zh-CN'],
      },
      speechRateMultiplier: 0.9,
    },
    transliteration: {
      enabled: true,
      supportsLatinInput: true, // Pinyin input
    },
    locale: {
      dateFormat: 'YYYY年MM月DD日',
      timeFormat: '24h',
      numberFormat: 'comma',
      currency: 'CNY',
      emergencyNumber: '110',
    },
  },

  // Chinese (Traditional)
  'zh-TW': {
    code: 'zh-TW',
    name: 'Chinese (Traditional)',
    nativeName: '繁體中文',
    script: 'chinese',
    direction: 'ltr',
    region: 'Taiwan/Hong Kong',
    voice: {
      whisperCode: 'zh',
      ttsVoices: {
        ios: ['com.apple.voice.compact.zh-TW.Mei-Jia', 'zh-TW'],
        android: ['zh-TW-language', 'zh-tw-x-ctt#female_1-local', 'zh-TW'],
        web: ['Google 國語（臺灣）', 'zh-TW'],
      },
      speechRateMultiplier: 0.9,
    },
    transliteration: {
      enabled: true,
      supportsLatinInput: true,
    },
    locale: {
      dateFormat: 'YYYY年MM月DD日',
      timeFormat: '12h',
      numberFormat: 'comma',
      currency: 'TWD',
      emergencyNumber: '110',
    },
  },

  // Japanese
  ja: {
    code: 'ja',
    name: 'Japanese',
    nativeName: '日本語',
    script: 'japanese',
    direction: 'ltr',
    region: 'Japan',
    voice: {
      whisperCode: 'ja',
      ttsVoices: {
        ios: ['com.apple.voice.compact.ja-JP.Kyoko', 'ja-JP'],
        android: ['ja-JP-language', 'ja-jp-x-jac#female_1-local', 'ja-JP'],
        web: ['Google 日本語', 'Microsoft Haruka - Japanese (Japan)', 'ja-JP'],
      },
      speechRateMultiplier: 0.9,
    },
    transliteration: {
      enabled: true,
      supportsLatinInput: true, // Romaji input
    },
    locale: {
      dateFormat: 'YYYY年MM月DD日',
      timeFormat: '24h',
      numberFormat: 'comma',
      currency: 'JPY',
      emergencyNumber: '110',
    },
  },

  // Korean
  ko: {
    code: 'ko',
    name: 'Korean',
    nativeName: '한국어',
    script: 'korean',
    direction: 'ltr',
    region: 'Korea',
    voice: {
      whisperCode: 'ko',
      ttsVoices: {
        ios: ['com.apple.voice.compact.ko-KR.Yuna', 'ko-KR'],
        android: ['ko-KR-language', 'ko-kr-x-kok#female_1-local', 'ko-KR'],
        web: ['Google 한국어', 'Microsoft Heami - Korean (Korea)', 'ko-KR'],
      },
      speechRateMultiplier: 0.9,
    },
    transliteration: {
      enabled: true,
      supportsLatinInput: true,
    },
    locale: {
      dateFormat: 'YYYY년 MM월 DD일',
      timeFormat: '12h',
      numberFormat: 'comma',
      currency: 'KRW',
      emergencyNumber: '112',
    },
  },

  // Thai
  th: {
    code: 'th',
    name: 'Thai',
    nativeName: 'ไทย',
    script: 'thai',
    direction: 'ltr',
    region: 'Thailand',
    voice: {
      whisperCode: 'th',
      ttsVoices: {
        ios: ['com.apple.voice.compact.th-TH.Kanya', 'th-TH'],
        android: ['th-TH-language', 'th-TH'],
        web: ['Google ไทย', 'th-TH'],
      },
      speechRateMultiplier: 0.85,
    },
    transliteration: {
      enabled: true,
      supportsLatinInput: true,
    },
    locale: {
      dateFormat: 'DD/MM/YYYY',
      timeFormat: '24h',
      numberFormat: 'comma',
      currency: 'THB',
      emergencyNumber: '191',
    },
  },

  // Vietnamese
  vi: {
    code: 'vi',
    name: 'Vietnamese',
    nativeName: 'Tiếng Việt',
    script: 'latin',
    direction: 'ltr',
    region: 'Vietnam',
    voice: {
      whisperCode: 'vi',
      ttsVoices: {
        ios: ['com.apple.voice.compact.vi-VN.Linh', 'vi-VN'],
        android: ['vi-VN-language', 'vi-vn-x-vif#female_1-local', 'vi-VN'],
        web: ['Google Tiếng Việt', 'vi-VN'],
      },
      speechRateMultiplier: 0.9,
    },
    transliteration: {
      enabled: false,
      supportsLatinInput: true,
    },
    locale: {
      dateFormat: 'DD/MM/YYYY',
      timeFormat: '24h',
      numberFormat: 'dot',
      currency: 'VND',
      emergencyNumber: '113',
    },
  },

  // Indonesian
  id: {
    code: 'id',
    name: 'Indonesian',
    nativeName: 'Bahasa Indonesia',
    script: 'latin',
    direction: 'ltr',
    region: 'Indonesia',
    voice: {
      whisperCode: 'id',
      ttsVoices: {
        ios: ['com.apple.voice.compact.id-ID.Damayanti', 'id-ID'],
        android: ['id-ID-language', 'id-id-x-idf#female_1-local', 'id-ID'],
        web: ['Google Bahasa Indonesia', 'id-ID'],
      },
      speechRateMultiplier: 1.0,
    },
    transliteration: {
      enabled: false,
      supportsLatinInput: true,
    },
    locale: {
      dateFormat: 'DD/MM/YYYY',
      timeFormat: '24h',
      numberFormat: 'dot',
      currency: 'IDR',
      emergencyNumber: '112',
    },
  },

  // Malay
  ms: {
    code: 'ms',
    name: 'Malay',
    nativeName: 'Bahasa Melayu',
    script: 'latin',
    direction: 'ltr',
    region: 'Malaysia',
    voice: {
      whisperCode: 'ms',
      ttsVoices: {
        ios: ['ms-MY'],
        android: ['ms-MY-language', 'ms-MY'],
        web: ['ms-MY'],
      },
      speechRateMultiplier: 1.0,
    },
    transliteration: {
      enabled: false,
      supportsLatinInput: true,
    },
    locale: {
      dateFormat: 'DD/MM/YYYY',
      timeFormat: '12h',
      numberFormat: 'comma',
      currency: 'MYR',
      emergencyNumber: '999',
    },
  },

  // Tagalog/Filipino
  tl: {
    code: 'tl',
    name: 'Tagalog',
    nativeName: 'Tagalog',
    script: 'latin',
    direction: 'ltr',
    region: 'Philippines',
    voice: {
      whisperCode: 'tl',
      ttsVoices: {
        ios: ['fil-PH'],
        android: ['fil-PH-language', 'fil-PH'],
        web: ['fil-PH'],
      },
      speechRateMultiplier: 1.0,
    },
    transliteration: {
      enabled: false,
      supportsLatinInput: true,
    },
    locale: {
      dateFormat: 'MM/DD/YYYY',
      timeFormat: '12h',
      numberFormat: 'comma',
      currency: 'PHP',
      emergencyNumber: '911',
    },
  },

  // Burmese
  my: {
    code: 'my',
    name: 'Burmese',
    nativeName: 'မြန်မာစာ',
    script: 'other',
    direction: 'ltr',
    region: 'Myanmar',
    voice: {
      whisperCode: 'my',
      ttsVoices: {
        ios: ['my-MM'],
        android: ['my-MM'],
        web: ['my-MM'],
      },
      speechRateMultiplier: 0.9,
    },
    transliteration: {
      enabled: true,
      supportsLatinInput: true,
    },
    locale: {
      dateFormat: 'DD/MM/YYYY',
      timeFormat: '24h',
      numberFormat: 'comma',
      currency: 'MMK',
      emergencyNumber: '199',
    },
  },

  // Khmer
  km: {
    code: 'km',
    name: 'Khmer',
    nativeName: 'ភាសាខ្មែរ',
    script: 'other',
    direction: 'ltr',
    region: 'Cambodia',
    voice: {
      whisperCode: 'km',
      ttsVoices: {
        ios: ['km-KH'],
        android: ['km-KH'],
        web: ['km-KH'],
      },
      speechRateMultiplier: 0.9,
    },
    transliteration: {
      enabled: true,
      supportsLatinInput: true,
    },
    locale: {
      dateFormat: 'DD/MM/YYYY',
      timeFormat: '24h',
      numberFormat: 'comma',
      currency: 'KHR',
      emergencyNumber: '117',
    },
  },

  // Arabic
  ar: {
    code: 'ar',
    name: 'Arabic',
    nativeName: 'العربية',
    script: 'arabic',
    direction: 'rtl',
    region: 'Middle East',
    voice: {
      whisperCode: 'ar',
      ttsVoices: {
        ios: ['com.apple.voice.compact.ar-SA.Maged', 'ar-SA'],
        android: ['ar-SA-language', 'ar-XA'],
        web: ['Google العربية', 'ar-SA'],
      },
      speechRateMultiplier: 0.9,
    },
    transliteration: {
      enabled: true,
      supportsLatinInput: true,
    },
    locale: {
      dateFormat: 'DD/MM/YYYY',
      timeFormat: '12h',
      numberFormat: 'comma',
      currency: 'SAR',
      emergencyNumber: '911',
    },
  },

  // Hebrew
  he: {
    code: 'he',
    name: 'Hebrew',
    nativeName: 'עברית',
    script: 'hebrew',
    direction: 'rtl',
    region: 'Israel',
    voice: {
      whisperCode: 'he',
      ttsVoices: {
        ios: ['com.apple.voice.compact.he-IL.Carmit', 'he-IL'],
        android: ['he-IL-language', 'he-IL'],
        web: ['Google עברית', 'he-IL'],
      },
      speechRateMultiplier: 0.95,
    },
    transliteration: {
      enabled: true,
      supportsLatinInput: true,
    },
    locale: {
      dateFormat: 'DD/MM/YYYY',
      timeFormat: '24h',
      numberFormat: 'comma',
      currency: 'ILS',
      emergencyNumber: '100',
    },
  },

  // Persian/Farsi
  fa: {
    code: 'fa',
    name: 'Persian',
    nativeName: 'فارسی',
    script: 'arabic',
    direction: 'rtl',
    region: 'Iran',
    voice: {
      whisperCode: 'fa',
      ttsVoices: {
        ios: ['fa-IR'],
        android: ['fa-IR-language', 'fa-IR'],
        web: ['fa-IR'],
      },
      speechRateMultiplier: 0.9,
    },
    transliteration: {
      enabled: true,
      supportsLatinInput: true,
    },
    locale: {
      dateFormat: 'YYYY/MM/DD',
      timeFormat: '24h',
      numberFormat: 'comma',
      currency: 'IRR',
      emergencyNumber: '115',
    },
  },

  // Turkish
  tr: {
    code: 'tr',
    name: 'Turkish',
    nativeName: 'Türkçe',
    script: 'latin',
    direction: 'ltr',
    region: 'Turkey',
    voice: {
      whisperCode: 'tr',
      ttsVoices: {
        ios: ['com.apple.voice.compact.tr-TR.Yelda', 'tr-TR'],
        android: ['tr-TR-language', 'tr-tr-x-trf#female_1-local', 'tr-TR'],
        web: ['Google Türkçe', 'Microsoft Tolga - Turkish (Turkey)', 'tr-TR'],
      },
      speechRateMultiplier: 0.95,
    },
    transliteration: {
      enabled: false,
      supportsLatinInput: true,
    },
    locale: {
      dateFormat: 'DD.MM.YYYY',
      timeFormat: '24h',
      numberFormat: 'dot',
      currency: 'TRY',
      emergencyNumber: '112',
    },
  },

  // Swahili
  sw: {
    code: 'sw',
    name: 'Swahili',
    nativeName: 'Kiswahili',
    script: 'latin',
    direction: 'ltr',
    region: 'East Africa',
    voice: {
      whisperCode: 'sw',
      ttsVoices: {
        ios: ['sw-KE'],
        android: ['sw-KE-language', 'sw-KE'],
        web: ['sw-KE'],
      },
      speechRateMultiplier: 1.0,
    },
    transliteration: {
      enabled: false,
      supportsLatinInput: true,
    },
    locale: {
      dateFormat: 'DD/MM/YYYY',
      timeFormat: '24h',
      numberFormat: 'comma',
      currency: 'KES',
      emergencyNumber: '999',
    },
  },

  // Amharic
  am: {
    code: 'am',
    name: 'Amharic',
    nativeName: 'አማርኛ',
    script: 'other',
    direction: 'ltr',
    region: 'Ethiopia',
    voice: {
      whisperCode: 'am',
      ttsVoices: {
        ios: ['am-ET'],
        android: ['am-ET'],
        web: ['am-ET'],
      },
      speechRateMultiplier: 0.9,
    },
    transliteration: {
      enabled: true,
      supportsLatinInput: true,
    },
    locale: {
      dateFormat: 'DD/MM/YYYY',
      timeFormat: '12h',
      numberFormat: 'comma',
      currency: 'ETB',
      emergencyNumber: '991',
    },
  },

  // Afrikaans
  af: {
    code: 'af',
    name: 'Afrikaans',
    nativeName: 'Afrikaans',
    script: 'latin',
    direction: 'ltr',
    region: 'South Africa',
    voice: {
      whisperCode: 'af',
      ttsVoices: {
        ios: ['af-ZA'],
        android: ['af-ZA-language', 'af-ZA'],
        web: ['af-ZA'],
      },
      speechRateMultiplier: 1.0,
    },
    transliteration: {
      enabled: false,
      supportsLatinInput: true,
    },
    locale: {
      dateFormat: 'YYYY/MM/DD',
      timeFormat: '24h',
      numberFormat: 'space',
      currency: 'ZAR',
      emergencyNumber: '10111',
    },
  },
};

// Helper functions
export function getLanguageConfig(code: LanguageCode): LanguageConfig {
  return LANGUAGES[code] || LANGUAGES.en;
}

export function getLanguageByWhisperCode(whisperCode: string): LanguageConfig | undefined {
  return Object.values(LANGUAGES).find(lang => lang.voice.whisperCode === whisperCode);
}

export function getSupportedLanguages(): LanguageCode[] {
  return Object.keys(LANGUAGES) as LanguageCode[];
}

export function getLanguagesForRegion(region: string): LanguageConfig[] {
  return Object.values(LANGUAGES).filter(lang =>
    lang.region.toLowerCase().includes(region.toLowerCase())
  );
}

export function isRTLLanguage(code: LanguageCode): boolean {
  return LANGUAGES[code]?.direction === 'rtl';
}

export function getIndianLanguages(): LanguageConfig[] {
  return Object.values(LANGUAGES).filter(lang =>
    lang.locale.currency === 'INR' || lang.region.includes('India')
  );
}

// Language groups for UI organization
export const LANGUAGE_GROUPS = {
  indian: ['hi', 'mr', 'bn', 'ta', 'te', 'gu', 'kn', 'ml', 'pa', 'or', 'as', 'ur'] as LanguageCode[],
  european: ['en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'pl', 'nl', 'sv', 'no', 'da', 'fi', 'el', 'cs', 'hu', 'ro', 'bg', 'uk', 'sk', 'hr', 'sr', 'sl', 'lt', 'lv', 'et'] as LanguageCode[],
  eastAsian: ['zh', 'zh-TW', 'ja', 'ko'] as LanguageCode[],
  southeastAsian: ['th', 'vi', 'id', 'ms', 'tl', 'my', 'km'] as LanguageCode[],
  middleEastern: ['ar', 'he', 'fa', 'tr'] as LanguageCode[],
  african: ['sw', 'am', 'af'] as LanguageCode[],
};

export default LANGUAGES;
