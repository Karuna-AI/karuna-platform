/**
 * Jest Configuration for Karuna Platform
 * Comprehensive testing setup for mobile app, web dashboard, and server
 */

module.exports = {
  testEnvironment: 'jsdom',
  roots: ['<rootDir>'],
  modulePaths: ['<rootDir>/../'],

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
    '^react-native-tts$': '<rootDir>/../src/web/tts-mock.ts',
    '^react-native-audio-recorder-player$': '<rootDir>/../src/web/audio-recorder-mock.ts',
    '^@react-native-async-storage/async-storage$': '<rootDir>/../src/web/async-storage-mock.ts',
    '^@env$': '<rootDir>/../src/web/env-mock.ts',

    // Expo mocks
    '^expo-crypto$': '<rootDir>/../src/web/expo-crypto-mock.ts',
    '^expo-document-picker$': '<rootDir>/../src/web/expo-document-picker-mock.ts',
    '^expo-notifications$': '<rootDir>/../src/web/expo-notifications-mock.ts',
    '^expo-clipboard$': '<rootDir>/../src/web/expo-clipboard-mock.ts',
    '^expo-background-fetch$': '<rootDir>/../src/web/expo-background-fetch-mock.ts',
    '^expo-task-manager$': '<rootDir>/../src/web/expo-task-manager-mock.ts',
    '^expo-secure-store$': '<rootDir>/../src/web/expo-secure-store-mock.ts',
    '^expo-image-picker$': '<rootDir>/../src/web/expo-image-picker-mock.ts',
    '^expo-camera$': '<rootDir>/../src/web/expo-camera-mock.ts',
    '^expo-contacts$': '<rootDir>/../src/web/expo-contacts-mock.ts',
    '^expo-sensors$': '<rootDir>/../src/web/expo-sensors-mock.ts',
    '^expo-location$': '<rootDir>/../src/web/expo-location-mock.ts',
    '^expo-localization$': '<rootDir>/../src/web/expo-localization-mock.ts',
    '^expo-speech$': '<rootDir>/../src/web/expo-speech-mock.ts',
    '^expo-local-authentication$': '<rootDir>/../src/web/expo-local-authentication-mock.ts',
    '^expo-calendar$': '<rootDir>/../src/web/expo-calendar-mock.ts',
    '^expo-file-system$': '<rootDir>/../src/web/expo-file-system-mock.ts',
    '^@react-native-community/slider$': '<rootDir>/../src/web/slider-mock.tsx',
  },

  setupFilesAfterEnv: ['<rootDir>/setup/setupTests.ts'],

  testMatch: [
    '**/__tests__/**/*.test.{ts,tsx,js,jsx}',
    '**/*.spec.{ts,tsx,js,jsx}',
  ],

  // Don't transform node_modules except specific packages
  transformIgnorePatterns: [
    'node_modules/(?!(react-native-web)/)',
  ],

  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],

  collectCoverageFrom: [
    '../src/**/*.{ts,tsx}',
    '!../src/**/*.d.ts',
    '!../src/web/**/*-mock.ts',
    '!../src/types/**/*',
  ],

  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: ['text', 'lcov', 'html'],

  testTimeout: 10000,
  verbose: true,

  // Clear mocks between tests
  clearMocks: true,
  resetMocks: true,
};
