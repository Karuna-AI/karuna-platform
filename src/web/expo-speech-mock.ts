/**
 * Web mock for expo-speech
 * Uses Web Speech API
 */

let isSpeaking = false;
let currentUtterance: SpeechSynthesisUtterance | null = null;

export async function speak(
  text: string,
  options?: {
    language?: string;
    pitch?: number;
    rate?: number;
    voice?: string;
    volume?: number;
    onStart?: () => void;
    onDone?: () => void;
    onStopped?: () => void;
    onError?: (error: any) => void;
  }
): Promise<void> {
  if (!('speechSynthesis' in window)) {
    console.warn('[Speech] Web Speech API not available');
    options?.onError?.({ message: 'Speech synthesis not available' });
    return;
  }

  // Stop any current speech
  stop();

  const utterance = new SpeechSynthesisUtterance(text);
  currentUtterance = utterance;

  if (options?.language) utterance.lang = options.language;
  if (options?.pitch) utterance.pitch = options.pitch;
  if (options?.rate) utterance.rate = options.rate;
  if (options?.volume) utterance.volume = options.volume;

  // Find voice by name if specified
  if (options?.voice) {
    const voices = speechSynthesis.getVoices();
    const voice = voices.find(v => v.name === options.voice || v.voiceURI === options.voice);
    if (voice) utterance.voice = voice;
  }

  utterance.onstart = () => {
    isSpeaking = true;
    options?.onStart?.();
  };

  utterance.onend = () => {
    isSpeaking = false;
    currentUtterance = null;
    options?.onDone?.();
  };

  utterance.onerror = (event) => {
    isSpeaking = false;
    currentUtterance = null;
    if (event.error !== 'interrupted') {
      options?.onError?.(event);
    } else {
      options?.onStopped?.();
    }
  };

  speechSynthesis.speak(utterance);
}

export async function stop(): Promise<void> {
  if ('speechSynthesis' in window) {
    speechSynthesis.cancel();
    isSpeaking = false;
    currentUtterance = null;
  }
}

export async function pause(): Promise<void> {
  if ('speechSynthesis' in window) {
    speechSynthesis.pause();
  }
}

export async function resume(): Promise<void> {
  if ('speechSynthesis' in window) {
    speechSynthesis.resume();
  }
}

export function isSpeakingAsync(): Promise<boolean> {
  return Promise.resolve(isSpeaking);
}

export async function getAvailableVoicesAsync(): Promise<Array<{
  identifier: string;
  name: string;
  quality: string;
  language: string;
}>> {
  if (!('speechSynthesis' in window)) {
    return [];
  }

  // Wait for voices to load
  let voices = speechSynthesis.getVoices();
  if (voices.length === 0) {
    await new Promise<void>((resolve) => {
      speechSynthesis.onvoiceschanged = () => resolve();
      setTimeout(resolve, 1000); // Timeout fallback
    });
    voices = speechSynthesis.getVoices();
  }

  return voices.map(voice => ({
    identifier: voice.voiceURI,
    name: voice.name,
    quality: voice.localService ? 'Default' : 'Enhanced',
    language: voice.lang,
  }));
}

export default {
  speak,
  stop,
  pause,
  resume,
  isSpeakingAsync,
  getAvailableVoicesAsync,
};
