/**
 * Jest Configuration for Karuna Platform
 * Comprehensive testing setup for mobile app, web dashboard, and server
 */

module.exports = {
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/__tests__'],
  modulePaths: ['<rootDir>'],

  // Use ts-jest for TypeScript
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      tsconfig: {
        jsx: 'react',
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        moduleResolution: 'node',
        target: 'ES2020',
        module: 'commonjs',
        strict: false,
        skipLibCheck: true,
      },
    }],
    '^.+\\.(js|jsx)$': 'babel-jest',
  },

  moduleNameMapper: {
    // React Native Web aliases
    '^react-native$': 'react-native-web',
    '^react-native-tts$': '<rootDir>/src/web/tts-mock.ts',
    '^react-native-audio-recorder-player$': '<rootDir>/src/web/audio-recorder-mock.ts',
    '^@react-native-async-storage/async-storage$': '<rootDir>/src/web/async-storage-mock.ts',
    '^@env$': '<rootDir>/src/web/env-mock.ts',

    // Expo mocks
    '^expo-crypto$': '<rootDir>/src/web/expo-crypto-mock.ts',
    '^expo-document-picker$': '<rootDir>/src/web/expo-document-picker-mock.ts',
    '^expo-notifications$': '<rootDir>/src/web/expo-notifications-mock.ts',
    '^expo-clipboard$': '<rootDir>/src/web/expo-clipboard-mock.ts',
    '^expo-background-fetch$': '<rootDir>/src/web/expo-background-fetch-mock.ts',
    '^expo-task-manager$': '<rootDir>/src/web/expo-task-manager-mock.ts',
    '^expo-secure-store$': '<rootDir>/src/web/expo-secure-store-mock.ts',
    '^expo-image-picker$': '<rootDir>/src/web/expo-image-picker-mock.ts',
    '^expo-camera$': '<rootDir>/src/web/expo-camera-mock.ts',
    '^expo-contacts$': '<rootDir>/src/web/expo-contacts-mock.ts',
    '^expo-sensors$': '<rootDir>/src/web/expo-sensors-mock.ts',
    '^expo-location$': '<rootDir>/src/web/expo-location-mock.ts',
    '^expo-localization$': '<rootDir>/src/web/expo-localization-mock.ts',
    '^expo-speech$': '<rootDir>/src/web/expo-speech-mock.ts',
    '^expo-local-authentication$': '<rootDir>/src/web/expo-local-authentication-mock.ts',
    '^expo-calendar$': '<rootDir>/src/web/expo-calendar-mock.ts',
    '^expo-file-system$': '<rootDir>/src/web/expo-file-system-mock.ts',
    '^expo-file-system/legacy$': '<rootDir>/src/web/expo-file-system-mock.ts',
    '^expo-constants$': '<rootDir>/src/web/expo-constants-mock.ts',
    '^expo-av$': '<rootDir>/src/web/expo-av-mock.ts',
    '^expo-audio$': '<rootDir>/src/web/expo-audio-mock.ts',
    '^@react-native-community/netinfo$': '<rootDir>/src/web/netinfo-mock.ts',
    '^@react-native-community/slider$': '<rootDir>/src/web/slider-mock.tsx',
  },

  setupFilesAfterEnv: ['<rootDir>/__tests__/setup/setupTests.ts'],

  testMatch: [
    '**/__tests__/**/*.test.{ts,tsx,js,jsx}',
    '**/*.spec.{ts,tsx,js,jsx}',
  ],

  // Don't transform node_modules except specific packages
  transformIgnorePatterns: [
    'node_modules/(?!(react-native-web|expo-.*|@expo/.*|@react-native|react-native)/)',
  ],

  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],

  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/web/**/*-mock.ts',
    '!src/types/**/*',
  ],

  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: ['text', 'lcov', 'html'],

  coverageThreshold: {
    // Global floor: many native-only files (tts, voiceRecorder, permissions, weather,
    // vaultTools) are not testable in jsdom and drag the average to ~37-38%.
    // Per-file thresholds on critical services are the meaningful gates.
    global: {
      lines: 35,
      functions: 30,
      branches: 20,
      statements: 35,
    },
    // Security-critical services — must be thoroughly tested
    './src/services/vault.ts': { lines: 90, functions: 90, branches: 85 },
    './src/services/encryption.ts': { lines: 90, functions: 90, branches: 85 },
    './src/services/consent.ts': { lines: 90, functions: 90, branches: 85 },
    // Health & compliance services
    './src/services/medication.ts': { lines: 80, functions: 80, branches: 75 },
    './src/services/medicalRecords.ts': { lines: 80, functions: 80, branches: 75 },
    './src/services/healthData.ts': { lines: 80, functions: 80, branches: 75 },
    './src/services/auditLog.ts': { lines: 80, functions: 80, branches: 75 },
  },

  testTimeout: 10000,
  verbose: true,

  // clearMocks clears call history between tests; resetMocks stays false so that
  // global mocks set in setupTests.ts (fetch, WebSocket, speechSynthesis) retain
  // their implementations across tests.
  clearMocks: true,
  resetMocks: false,
};
