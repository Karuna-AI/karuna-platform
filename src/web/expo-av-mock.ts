const mockRecording = {
  prepareToRecordAsync: jest.fn(),
  startAsync: jest.fn(),
  stopAndUnloadAsync: jest.fn(),
  getStatusAsync: jest.fn().mockResolvedValue({ durationMillis: 1000 }),
  getURI: jest.fn().mockReturnValue('mock-recording-uri'),
};

export const Audio = {
  Recording: jest.fn().mockImplementation(() => mockRecording),
  Sound: {
    createAsync: jest.fn().mockResolvedValue({
      sound: {
        playAsync: jest.fn(),
        pauseAsync: jest.fn(),
        stopAsync: jest.fn(),
        unloadAsync: jest.fn(),
        setPositionAsync: jest.fn(),
        getStatusAsync: jest.fn().mockResolvedValue({ isPlaying: false, positionMillis: 0 }),
      },
      status: { isLoaded: true },
    }),
  },
  setAudioModeAsync: jest.fn(),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ granted: true, status: 'granted' }),
  getPermissionsAsync: jest.fn().mockResolvedValue({ granted: true, status: 'granted' }),
  RecordingOptionsPresets: {
    HIGH_QUALITY: {},
    LOW_QUALITY: {},
  },
  InterruptionModeIOS: {
    DoNotMix: 1,
    DuckOthers: 2,
    MixWithOthers: 0,
  },
  InterruptionModeAndroid: {
    DoNotMix: 1,
    DuckOthers: 2,
  },
};

export default { Audio };
