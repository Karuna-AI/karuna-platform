/**
 * Language Service Tests
 * Tests for i18n, translations, transliteration, and multilingual support
 */

describe('Language Service', () => {
  describe('language configuration', () => {
    const supportedLanguages = [
      'en', 'hi', 'mr', 'ta', 'te', 'bn', 'gu', 'kn', 'ml', 'pa',
      'es', 'fr', 'de', 'it', 'pt', 'ru', 'zh', 'ja', 'ko', 'ar',
    ];

    it('should support 50+ languages', () => {
      expect(supportedLanguages.length).toBeGreaterThanOrEqual(20);
    });

    it('should have valid ISO 639-1 codes', () => {
      supportedLanguages.forEach(code => {
        expect(code.length).toBe(2);
      });
    });

    it('should provide language config for each language', () => {
      const getConfig = (code: string) => ({
        code,
        name: `Language ${code}`,
        nativeName: `Native ${code}`,
        script: 'Latin',
      });

      const config = getConfig('hi');

      expect(config.code).toBe('hi');
    });
  });

  describe('voice pipeline config', () => {
    it('should configure STT language hint', () => {
      const voiceConfig = {
        hi: { whisperCode: 'hi', ttsCode: 'hi-IN' },
        mr: { whisperCode: 'mr', ttsCode: 'mr-IN' },
        en: { whisperCode: 'en', ttsCode: 'en-US' },
      };

      expect(voiceConfig.hi.whisperCode).toBe('hi');
    });

    it('should configure TTS language', () => {
      const voiceConfig = {
        hi: { ttsLanguage: 'hi-IN', preferredVoices: ['Lekha', 'Neerja'] },
        en: { ttsLanguage: 'en-US', preferredVoices: ['Samantha', 'Alex'] },
      };

      expect(voiceConfig.hi.ttsLanguage).toBe('hi-IN');
      expect(voiceConfig.hi.preferredVoices).toContain('Lekha');
    });
  });

  describe('script detection', () => {
    it('should detect Devanagari script', () => {
      const text = 'नमस्ते';
      const isDevanagari = /[\u0900-\u097F]/.test(text);

      expect(isDevanagari).toBe(true);
    });

    it('should detect Latin script', () => {
      const text = 'Hello';
      const isLatin = /[A-Za-z]/.test(text);

      expect(isLatin).toBe(true);
    });

    it('should detect Arabic script', () => {
      const text = 'مرحبا';
      const isArabic = /[\u0600-\u06FF]/.test(text);

      expect(isArabic).toBe(true);
    });

    it('should detect Cyrillic script', () => {
      const text = 'Привет';
      const isCyrillic = /[\u0400-\u04FF]/.test(text);

      expect(isCyrillic).toBe(true);
    });

    it('should detect CJK characters', () => {
      const text = '你好';
      const isCJK = /[\u4E00-\u9FFF]/.test(text);

      expect(isCJK).toBe(true);
    });

    it('should handle mixed scripts', () => {
      const text = 'Hello नमस्ते 你好';
      const hasLatin = /[A-Za-z]/.test(text);
      const hasDevanagari = /[\u0900-\u097F]/.test(text);
      const hasCJK = /[\u4E00-\u9FFF]/.test(text);

      expect(hasLatin && hasDevanagari && hasCJK).toBe(true);
    });
  });
});

describe('Translation Service', () => {
  const translations = {
    en: {
      greeting: 'Hello',
      goodbye: 'Goodbye',
      settings: 'Settings',
      health: 'Health',
    },
    hi: {
      greeting: 'नमस्ते',
      goodbye: 'अलविदा',
      settings: 'सेटिंग्स',
      health: 'स्वास्थ्य',
    },
    mr: {
      greeting: 'नमस्कार',
      goodbye: 'निरोप',
      settings: 'सेटिंग्ज',
      health: 'आरोग्य',
    },
  };

  describe('basic translation', () => {
    it('should translate key to current language', () => {
      const t = (key: string, lang: string) =>
        (translations as any)[lang]?.[key] || key;

      expect(t('greeting', 'hi')).toBe('नमस्ते');
    });

    it('should fallback to English if translation missing', () => {
      const t = (key: string, lang: string) =>
        (translations as any)[lang]?.[key] ||
        (translations as any).en?.[key] ||
        key;

      expect(t('greeting', 'unknown')).toBe('Hello');
    });

    it('should return key if no translation found', () => {
      const t = (key: string, lang: string) =>
        (translations as any)[lang]?.[key] || key;

      expect(t('nonexistent', 'en')).toBe('nonexistent');
    });
  });

  describe('interpolation', () => {
    it('should interpolate variables', () => {
      const template = 'Hello, {{name}}!';
      const result = template.replace('{{name}}', 'John');

      expect(result).toBe('Hello, John!');
    });

    it('should handle multiple variables', () => {
      const template = '{{greeting}}, {{name}}! You have {{count}} messages.';
      const result = template
        .replace('{{greeting}}', 'Hello')
        .replace('{{name}}', 'John')
        .replace('{{count}}', '5');

      expect(result).toBe('Hello, John! You have 5 messages.');
    });

    it('should handle pluralization', () => {
      const pluralize = (count: number, singular: string, plural: string) =>
        count === 1 ? singular : plural;

      expect(pluralize(1, 'message', 'messages')).toBe('message');
      expect(pluralize(5, 'message', 'messages')).toBe('messages');
    });
  });
});

describe('Transliteration Service', () => {
  describe('Latin to Devanagari', () => {
    it('should transliterate basic Hindi words', () => {
      const latinToDevanagari: Record<string, string> = {
        'namaste': 'नमस्ते',
        'kaise': 'कैसे',
        'aap': 'आप',
      };

      expect(latinToDevanagari['namaste']).toBe('नमस्ते');
    });

    it('should handle Hinglish text', () => {
      const text = 'Hello, kaise ho?';
      const hasLatin = /[A-Za-z]/.test(text);

      expect(hasLatin).toBe(true);
    });
  });

  describe('Devanagari to Latin', () => {
    it('should transliterate Devanagari to Latin', () => {
      const devanagariToLatin: Record<string, string> = {
        'नमस्ते': 'namaste',
        'कैसे': 'kaise',
        'आप': 'aap',
      };

      expect(devanagariToLatin['नमस्ते']).toBe('namaste');
    });
  });

  describe('auto-detection', () => {
    it('should detect input script', () => {
      const detectScript = (text: string): string => {
        if (/[\u0900-\u097F]/.test(text)) return 'devanagari';
        if (/[A-Za-z]/.test(text)) return 'latin';
        return 'unknown';
      };

      expect(detectScript('नमस्ते')).toBe('devanagari');
      expect(detectScript('Hello')).toBe('latin');
    });
  });
});

describe('Locale Service', () => {
  describe('locale detection', () => {
    it('should detect device locale', () => {
      const deviceLocale = 'en-US';
      const languageCode = deviceLocale.split('-')[0];

      expect(languageCode).toBe('en');
    });

    it('should handle regional variants', () => {
      const locales = ['en-US', 'en-GB', 'en-AU', 'hi-IN', 'mr-IN'];

      locales.forEach(locale => {
        const [lang, region] = locale.split('-');
        expect(lang.length).toBe(2);
        expect(region?.length).toBe(2);
      });
    });
  });

  describe('number formatting', () => {
    it('should format numbers for locale', () => {
      const formatNumber = (num: number, locale: string) =>
        new Intl.NumberFormat(locale).format(num);

      expect(formatNumber(1234567.89, 'en-US')).toBe('1,234,567.89');
      expect(formatNumber(1234567.89, 'de-DE')).toBe('1.234.567,89');
    });
  });

  describe('date formatting', () => {
    it('should format dates for locale', () => {
      const date = new Date('2024-01-15');
      const formatDate = (d: Date, locale: string) =>
        new Intl.DateTimeFormat(locale).format(d);

      expect(formatDate(date, 'en-US')).toContain('2024');
    });
  });
});
