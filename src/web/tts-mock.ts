// Web TTS implementation using Web Speech API

type TTSEventHandler = () => void;

class WebTTS {
  private synthesis: SpeechSynthesis | null = null;
  private utterance: SpeechSynthesisUtterance | null = null;
  private defaultRate: number = 0.8;
  private defaultPitch: number = 1.0;
  private defaultLanguage: string = 'en-US';
  private eventListeners: Map<string, TTSEventHandler[]> = new Map();

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.synthesis = window.speechSynthesis;
    }
  }

  async getInitStatus(): Promise<string> {
    if (!this.synthesis) {
      throw new Error('Speech synthesis not supported');
    }
    return 'success';
  }

  setDefaultRate(rate: number): void {
    this.defaultRate = rate;
  }

  setDefaultPitch(pitch: number): void {
    this.defaultPitch = pitch;
  }

  setDefaultLanguage(language: string): void {
    this.defaultLanguage = language;
  }

  addEventListener(event: string, handler: TTSEventHandler): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(handler);
  }

  removeEventListener(event: string, handler: TTSEventHandler): void {
    const handlers = this.eventListeners.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  private emit(event: string): void {
    const handlers = this.eventListeners.get(event);
    if (handlers) {
      handlers.forEach((handler) => handler());
    }
  }

  async speak(text: string): Promise<void> {
    if (!this.synthesis) {
      console.warn('Speech synthesis not supported');
      return;
    }

    this.synthesis.cancel();

    this.utterance = new SpeechSynthesisUtterance(text);
    this.utterance.rate = this.defaultRate;
    this.utterance.pitch = this.defaultPitch;
    this.utterance.lang = this.defaultLanguage;

    this.utterance.onstart = () => {
      this.emit('tts-start');
    };

    this.utterance.onend = () => {
      this.emit('tts-finish');
    };

    this.utterance.onerror = () => {
      this.emit('tts-cancel');
    };

    this.synthesis.speak(this.utterance);
  }

  async stop(): Promise<void> {
    if (this.synthesis) {
      this.synthesis.cancel();
      this.emit('tts-cancel');
    }
  }

  async pause(): Promise<void> {
    if (this.synthesis) {
      this.synthesis.pause();
    }
  }

  async resume(): Promise<void> {
    if (this.synthesis) {
      this.synthesis.resume();
    }
  }

  async requestInstallEngine(): Promise<void> {
    throw new Error('TTS engine installation not supported on web');
  }
}

const Tts = new WebTTS();

export default Tts;
