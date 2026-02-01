/**
 * Expo App Configuration
 *
 * This file allows dynamic configuration of the Expo app.
 * Values can be overridden based on environment variables.
 */

const IS_DEV = process.env.APP_ENV === 'development';
const IS_PREVIEW = process.env.APP_ENV === 'preview';

const getApiUrl = () => {
  if (IS_DEV) {
    return 'http://localhost:3000';
  }
  if (IS_PREVIEW) {
    return process.env.PREVIEW_API_URL || 'https://karuna-api-production.up.railway.app';
  }
  return process.env.API_URL || 'https://karuna-api-production.up.railway.app';
};

const getAppName = () => {
  if (IS_DEV) return 'Karuna (Dev)';
  if (IS_PREVIEW) return 'Karuna (Preview)';
  return 'Karuna';
};

module.exports = {
  expo: {
    name: getAppName(),
    slug: 'karuna-ai',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'automatic',
    splash: {
      image: './assets/splash.png',
      resizeMode: 'contain',
      backgroundColor: '#4F46E5',
    },
    assetBundlePatterns: ['**/*'],
    ios: {
      supportsTablet: true,
      bundleIdentifier: IS_DEV ? 'in.karunaapp.companion.dev' : 'in.karunaapp.companion',
      buildNumber: '1',
      infoPlist: {
        NSMicrophoneUsageDescription:
          'Karuna needs access to your microphone for voice conversations with your AI companion.',
        NSSpeechRecognitionUsageDescription:
          'Karuna uses speech recognition to understand your voice commands.',
        NSCameraUsageDescription:
          'Karuna needs camera access to take photos for your care circle.',
        NSPhotoLibraryUsageDescription:
          'Karuna needs photo library access to share images with your care circle.',
        NSHealthShareUsageDescription:
          'Karuna reads your health data to monitor your wellness and share updates with your care circle.',
        NSHealthUpdateUsageDescription:
          'Karuna records health metrics to help track your wellness journey.',
        UIBackgroundModes: ['audio', 'fetch', 'remote-notification'],
      },
      config: {
        usesNonExemptEncryption: false,
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#4F46E5',
      },
      package: IS_DEV ? 'in.karunaapp.companion.dev' : 'in.karunaapp.companion',
      versionCode: 3,
      targetSdkVersion: 35,
      compileSdkVersion: 35,
      permissions: [
        'android.permission.RECORD_AUDIO',
        'android.permission.CAMERA',
        'android.permission.READ_EXTERNAL_STORAGE',
        'android.permission.WRITE_EXTERNAL_STORAGE',
        'android.permission.VIBRATE',
        'android.permission.RECEIVE_BOOT_COMPLETED',
        'android.permission.INTERNET',
        'android.permission.ACCESS_NETWORK_STATE',
      ],
    },
    web: {
      favicon: './assets/favicon.png',
      bundler: 'metro',
    },
    plugins: [
      [
        'expo-build-properties',
        {
          android: {
            compileSdkVersion: 35,
            targetSdkVersion: 35,
            minSdkVersion: 24,
          },
        },
      ],
      [
        'expo-image-picker',
        {
          photosPermission:
            'Karuna needs access to your photos to share images with your care circle.',
          cameraPermission: 'Karuna needs access to your camera to take photos.',
        },
      ],
      [
        'expo-notifications',
        {
          icon: './assets/notification-icon.png',
          color: '#4F46E5',
          sounds: ['./assets/notification_sound.wav'],
        },
      ],
      [
        'expo-camera',
        {
          cameraPermission: 'Karuna needs camera access to take photos.',
        },
      ],
      [
        'expo-av',
        {
          microphonePermission:
            'Karuna needs microphone access for voice conversations.',
        },
      ],
    ],
    extra: {
      apiUrl: getApiUrl(),
      eas: {
        projectId: 'b2718a1a-6cc9-43e7-a894-58a19fa8d6e6',
      },
    },
    owner: process.env.EXPO_OWNER || 'snehal2026',
    runtimeVersion: '1.0.0',
    updates: {
      url: 'https://u.expo.dev/b2718a1a-6cc9-43e7-a894-58a19fa8d6e6',
    },
  },
};
