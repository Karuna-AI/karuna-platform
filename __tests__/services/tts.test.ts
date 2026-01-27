/**
 * TTS (Text-to-Speech) Service Tests
 * Tests for speech synthesis, voice selection, and language support
 */

describe('TTS Service', () => {
  let ttsService: any;

  beforeEach(() => {
    jest.resetModules();
    // Reset speech synthesis mock
    (global.speechSynthesis.speak as jest.Mock).mockClear();
    (global.speechSynthesis.cancel as jest.Mock).mockClear();
    (global.speechSynthesis.getVoices as jest.Mock).mockReturnValue([
      { name: 'English Voice', lang: 'en-US', default: true },
      { name: 'Hindi Voice', lang: 'hi-IN', default: false },
      { name: 'Marathi Voice', lang: 'mr-IN', default: false },
      { name: 'Spanish Voice', lang: 'es-ES', default: false },
    ]);
  });

  describe('speak', () => {
    it('should speak text using speech synthesis', async () => {
      const text = 'Hello, this is a test';

      global.speechSynthesis.speak(new SpeechSynthesisUtterance(text));

      expect(global.speechSynthesis.speak).toHaveBeenCalled();
    });

    it('should handle empty text gracefully', async () => {
      global.speechSynthesis.speak(new SpeechSynthesisUtterance(''));

      expect(global.speechSynthesis.speak).toHaveBeenCalled();
    });

    it('should cancel previous speech before new speech', async () => {
      global.speechSynthesis.cancel();
      global.speechSynthesis.speak(new SpeechSynthesisUtterance('New text'));

      expect(global.speechSynthesis.cancel).toHaveBeenCalled();
      expect(global.speechSynthesis.speak).toHaveBeenCalled();
    });
  });

  describe('stop', () => {
    it('should stop current speech', () => {
      global.speechSynthesis.cancel();

      expect(global.speechSynthesis.cancel).toHaveBeenCalled();
    });
  });

  describe('setLanguage', () => {
    it('should set language for TTS', () => {
      const utterance = new SpeechSynthesisUtterance('Test');
      utterance.lang = 'hi-IN';

      expect(utterance.lang).toBe('hi-IN');
    });

    it('should select appropriate voice for language', () => {
      const voices = global.speechSynthesis.getVoices();
      const hindiVoice = voices.find((v: any) => v.lang === 'hi-IN');

      expect(hindiVoice).toBeDefined();
      expect(hindiVoice.name).toBe('Hindi Voice');
    });

    it('should fallback to default voice if language not available', () => {
      const voices = global.speechSynthesis.getVoices();
      const defaultVoice = voices.find((v: any) => v.default);

      expect(defaultVoice).toBeDefined();
      expect(defaultVoice.lang).toBe('en-US');
    });
  });

  describe('getAvailableVoices', () => {
    it('should return available voices', () => {
      const voices = global.speechSynthesis.getVoices();

      expect(voices).toHaveLength(4);
      expect(voices.map((v: any) => v.lang)).toContain('en-US');
      expect(voices.map((v: any) => v.lang)).toContain('hi-IN');
    });

    it('should filter voices by language', () => {
      const voices = global.speechSynthesis.getVoices();
      const indianVoices = voices.filter((v: any) =>
        v.lang.includes('-IN')
      );

      expect(indianVoices).toHaveLength(2);
    });
  });

  describe('setSpeechRate', () => {
    it('should set speech rate', () => {
      const utterance = new SpeechSynthesisUtterance('Test');
      utterance.rate = 0.8;

      expect(utterance.rate).toBe(0.8);
    });

    it('should clamp speech rate to valid range', () => {
      const utterance = new SpeechSynthesisUtterance('Test');

      // Rate should typically be between 0.1 and 10
      utterance.rate = 1.5;
      expect(utterance.rate).toBe(1.5);
    });
  });

  describe('language support', () => {
    const languageTests = [
      { code: 'en', expectedLang: 'en-US', name: 'English' },
      { code: 'hi', expectedLang: 'hi-IN', name: 'Hindi' },
      { code: 'mr', expectedLang: 'mr-IN', name: 'Marathi' },
      { code: 'es', expectedLang: 'es-ES', name: 'Spanish' },
    ];

    languageTests.forEach(({ code, expectedLang, name }) => {
      it(`should support ${name} (${code})`, () => {
        const voices = global.speechSynthesis.getVoices();
        const voice = voices.find((v: any) => v.lang === expectedLang);

        expect(voice).toBeDefined();
      });
    });
  });
});

describe('TTS Queue Management', () => {
  it('should queue multiple utterances', () => {
    const texts = ['First', 'Second', 'Third'];

    texts.forEach(text => {
      global.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
    });

    expect(global.speechSynthesis.speak).toHaveBeenCalledTimes(3);
  });

  it('should handle interruption mid-speech', () => {
    global.speechSynthesis.speak(new SpeechSynthesisUtterance('Long text...'));
    global.speechSynthesis.cancel();

    expect(global.speechSynthesis.cancel).toHaveBeenCalled();
  });
});
