import {
  Platform,
  PermissionsAndroid,
  Linking,
  Alert,
} from 'react-native';
import * as Notifications from 'expo-notifications';

export type PermissionStatus =
  | 'granted'
  | 'denied'
  | 'blocked'
  | 'unavailable'
  | 'limited';

export interface PermissionResult {
  status: PermissionStatus;
  canAskAgain: boolean;
}

class PermissionsService {
  /**
   * Check if microphone permission is granted
   */
  async checkMicrophonePermission(): Promise<PermissionResult> {
    if (Platform.OS === 'android') {
      const status = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
      );
      return {
        status: status ? 'granted' : 'denied',
        canAskAgain: true,
      };
    }

    // iOS permissions are handled by the system
    // We'll know the status when we try to record
    return { status: 'granted', canAskAgain: true };
  }

  /**
   * Request microphone permission with proper handling for "don't ask again"
   */
  async requestMicrophonePermission(): Promise<PermissionResult> {
    if (Platform.OS === 'android') {
      try {
        const result = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          {
            title: 'Microphone Permission',
            message:
              'Karuna needs access to your microphone so you can talk to me. ' +
              'This helps me understand what you need.',
            buttonPositive: 'Allow',
            buttonNegative: 'Deny',
          }
        );

        switch (result) {
          case PermissionsAndroid.RESULTS.GRANTED:
            return { status: 'granted', canAskAgain: true };

          case PermissionsAndroid.RESULTS.DENIED:
            return { status: 'denied', canAskAgain: true };

          case PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN:
            return { status: 'blocked', canAskAgain: false };

          default:
            return { status: 'denied', canAskAgain: true };
        }
      } catch (error) {
        console.error('Permission request error:', error);
        return { status: 'denied', canAskAgain: true };
      }
    }

    // iOS - permission is requested automatically when recording starts
    return { status: 'granted', canAskAgain: true };
  }

  /**
   * Request storage permissions (Android only, for saving recordings)
   */
  async requestStoragePermissions(): Promise<PermissionResult> {
    if (Platform.OS !== 'android') {
      return { status: 'granted', canAskAgain: true };
    }

    // Android 13+ doesn't need these permissions for app-specific storage
    if (Platform.Version >= 33) {
      return { status: 'granted', canAskAgain: true };
    }

    try {
      const grants = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
        PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
      ]);

      const writeStatus = grants[PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE];
      const readStatus = grants[PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE];

      if (
        writeStatus === PermissionsAndroid.RESULTS.GRANTED &&
        readStatus === PermissionsAndroid.RESULTS.GRANTED
      ) {
        return { status: 'granted', canAskAgain: true };
      }

      if (
        writeStatus === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN ||
        readStatus === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN
      ) {
        return { status: 'blocked', canAskAgain: false };
      }

      return { status: 'denied', canAskAgain: true };
    } catch (error) {
      console.error('Storage permission error:', error);
      return { status: 'denied', canAskAgain: true };
    }
  }

  /**
   * Request all required permissions for voice recording
   */
  async requestAllPermissions(): Promise<PermissionResult> {
    const micResult = await this.requestMicrophonePermission();

    if (micResult.status !== 'granted') {
      return micResult;
    }

    const storageResult = await this.requestStoragePermissions();

    if (storageResult.status !== 'granted') {
      return storageResult;
    }

    return { status: 'granted', canAskAgain: true };
  }

  /**
   * Request notification permission
   */
  async requestNotificationPermission(): Promise<PermissionResult> {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      if (existingStatus === 'granted') {
        return { status: 'granted', canAskAgain: true };
      }

      const { status } = await Notifications.requestPermissionsAsync();
      if (status === 'granted') {
        return { status: 'granted', canAskAgain: true };
      }
      return { status: 'denied', canAskAgain: false };
    } catch (error) {
      console.error('Notification permission error:', error);
      return { status: 'denied', canAskAgain: true };
    }
  }

  /**
   * Open device settings so user can manually enable permissions
   */
  async openSettings(): Promise<void> {
    try {
      if (Platform.OS === 'android') {
        await Linking.openSettings();
      } else {
        // iOS - open app settings
        await Linking.openURL('app-settings:');
      }
    } catch (error) {
      console.error('Could not open settings:', error);
      Alert.alert(
        'Unable to Open Settings',
        'Please go to your device Settings app and enable microphone access for Karuna.',
        [{ text: 'OK' }]
      );
    }
  }

  /**
   * Show a user-friendly alert when permission is blocked
   */
  showPermissionBlockedAlert(): void {
    Alert.alert(
      'Microphone Access Needed',
      'To talk with Karuna, you need to allow microphone access. ' +
      'Please tap "Open Settings" and turn on the microphone permission.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Open Settings',
          onPress: () => this.openSettings(),
        },
      ]
    );
  }

  /**
   * Show a user-friendly alert when permission is denied (can ask again)
   */
  showPermissionDeniedAlert(onRetry: () => void): void {
    Alert.alert(
      'Microphone Permission',
      'Karuna needs microphone access to hear what you say. ' +
      'Would you like to try again?',
      [
        {
          text: 'No, Thanks',
          style: 'cancel',
        },
        {
          text: 'Try Again',
          onPress: onRetry,
        },
      ]
    );
  }
}

export const permissionsService = new PermissionsService();
export default permissionsService;
