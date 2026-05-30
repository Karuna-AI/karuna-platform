// Jest mock for `expo-audio` so that statically-imported voiceRecorder.ts
// doesn't pull expo-modules-core's EventEmitter (which reads globalThis.expo,
// undefined under jsdom) at module-load time. Surface area matches what
// src/services/voiceRecorder.ts uses.

const mockRecorder = {
  prepareToRecordAsync: jest.fn().mockResolvedValue(undefined),
  record: jest.fn(),
  pause: jest.fn(),
  stop: jest.fn().mockResolvedValue(undefined),
  release: jest.fn(),
  getStatus: jest.fn().mockReturnValue({
    isRecording: false,
    durationMillis: 0,
    metering: -60,
  }),
  setOnRecordingStatusUpdate: jest.fn(),
  uri: 'mock-recording-uri',
};

const AudioRecorderMock = jest.fn().mockImplementation(() => mockRecorder);

export const AudioModule = {
  AudioRecorder: AudioRecorderMock,
};

export const RecordingPresets = {
  HIGH_QUALITY: {
    extension: '.m4a',
    sampleRate: 44100,
    numberOfChannels: 1,
    bitRate: 128000,
  },
  LOW_QUALITY: {
    extension: '.m4a',
    sampleRate: 22050,
    numberOfChannels: 1,
    bitRate: 64000,
  },
};

export const setAudioModeAsync = jest.fn().mockResolvedValue(undefined);
export const requestRecordingPermissionsAsync = jest.fn().mockResolvedValue({ granted: true, status: 'granted' });
export const getRecordingPermissionsAsync = jest.fn().mockResolvedValue({ granted: true, status: 'granted' });
export const setIsAudioActiveAsync = jest.fn().mockResolvedValue(undefined);

// Hooks (no-ops for tests that import them but don't render with them)
export const useAudioRecorder = jest.fn().mockReturnValue(mockRecorder);
export const useAudioRecorderState = jest.fn().mockReturnValue({
  isRecording: false,
  durationMillis: 0,
  metering: -60,
});
export const useAudioPlayer = jest.fn().mockReturnValue({
  play: jest.fn(),
  pause: jest.fn(),
  remove: jest.fn(),
});

export enum PermissionStatus {
  UNDETERMINED = 'undetermined',
  DENIED = 'denied',
  GRANTED = 'granted',
}
