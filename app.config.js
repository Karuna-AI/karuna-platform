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
    return process.env.GATEWAY_URL || 'http://localhost:3021';
  }
  if (IS_PREVIEW) {
    if (!process.env.PREVIEW_API_URL) throw new Error('PREVIEW_API_URL is required for preview builds');
    return process.env.PREVIEW_API_URL;
  }
  if (!process.env.API_URL) throw new Error('API_URL is required for production builds');
  return process.env.API_URL;
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
    scheme: 'karuna',
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
    // Use JSC on iOS to avoid Hermes PAC crash on iOS 26 physical devices
    // (expo/expo#44356, facebook/hermes#1966)
    jsEngine: 'hermes',
    ios: {
      jsEngine: 'jsc',
      supportsTablet: true,
      bundleIdentifier: IS_DEV ? 'in.karunaapp.companion.dev' : 'in.karunaapp.companion',
      buildNumber: '31',
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
        NSCalendarsUsageDescription:
          'Karuna accesses your calendar to help manage appointments and send you timely reminders.',
        NSContactsUsageDescription:
          'Karuna accesses your contacts so you can quickly call or message family and caregivers.',
        // 'audio' removed: triggers AVAudioSession class loading on iOS 26 which crashes
        // Audio recording works without background mode — only needed for background playback
        UIBackgroundModes: ['fetch', 'remote-notification'],
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
      versionCode: 10,
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
        // Health Connect (Android 13+)
        'android.permission.health.READ_HEART_RATE',
        'android.permission.health.READ_STEPS',
        'android.permission.health.READ_BLOOD_PRESSURE',
        'android.permission.health.READ_BLOOD_GLUCOSE',
        'android.permission.health.READ_BODY_WEIGHT',
        'android.permission.health.READ_OXYGEN_SATURATION',
        'android.permission.health.WRITE_HEART_RATE',
        'android.permission.health.WRITE_STEPS',
        'android.permission.health.WRITE_BLOOD_PRESSURE',
        'android.permission.health.WRITE_BLOOD_GLUCOSE',
        'android.permission.health.WRITE_BODY_WEIGHT',
        'android.permission.health.WRITE_OXYGEN_SATURATION',
      ],
      intentFilters: [
        {
          action: 'VIEW',
          autoVerify: true,
          data: [{ scheme: 'karuna' }],
          category: ['BROWSABLE', 'DEFAULT'],
        },
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
          ios: {
            // New Architecture enabled with TurboModule crash patch (react-native+0.81.5.patch)
            newArchEnabled: true,
            // iOS 26 Privacy Manifest (required for App Store submission since Spring 2024)
            // Declares which privacy-sensitive APIs the app uses and why.
            // https://developer.apple.com/documentation/bundleresources/privacy_manifest_files
            privacyManifests: {
              NSPrivacyAccessedAPITypes: [
                {
                  // NSUserDefaults — used by AsyncStorage (@react-native-async-storage)
                  NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
                  NSPrivacyAccessedAPITypeReasons: ['CA92.1'],
                },
                {
                  // File timestamp — used by expo-file-system for media attachments
                  NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryFileTimestamp',
                  NSPrivacyAccessedAPITypeReasons: ['C617.1'],
                },
                {
                  // Disk space — used by expo-file-system
                  NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryDiskSpace',
                  NSPrivacyAccessedAPITypeReasons: ['85F4.1'],
                },
              ],
              NSPrivacyCollectedDataTypes: [],
              NSPrivacyTracking: false,
              NSPrivacyTrackingDomains: [],
            },
          },
          android: {
            compileSdkVersion: 35,
            targetSdkVersion: 35,
            minSdkVersion: 24,
            // Device-test builds talk to the local gateway over adb reverse
            // (http://localhost:3021), which needs cleartext HTTP. Never set
            // for store builds.
            ...(process.env.ALLOW_CLEARTEXT === '1' ? { usesCleartextTraffic: true } : {}),
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
      'expo-audio',
      'expo-localization',
      'expo-secure-store',
    ],
    extra: {
      apiUrl: getApiUrl(),
      eas: {
        projectId: 'b2718a1a-6cc9-43e7-a894-58a19fa8d6e6',
      },
    },
    owner: process.env.EXPO_OWNER || 'karuna-ai',
    runtimeVersion: '1.0.0',
    updates: {
      enabled: false,
      url: 'https://u.expo.dev/b2718a1a-6cc9-43e7-a894-58a19fa8d6e6',
      checkAutomatically: 'NEVER',
    },
  },
};
