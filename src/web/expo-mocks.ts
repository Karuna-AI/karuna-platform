/**
 * Web mocks for Expo packages that don't have web support
 * These provide no-op or localStorage-based implementations for web
 */

import * as secureStoreMock from './expo-secure-store-mock';
import * as imagePickerMock from './expo-image-picker-mock';
import * as cameraMock from './expo-camera-mock';

// expo-document-picker mock
export const expoDocumentPicker = {
  getDocumentAsync: async (options?: any) => {
    // Use native file input on web
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      if (options?.type) {
        input.accept = Array.isArray(options.type) ? options.type.join(',') : options.type;
      }
      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
          resolve({
            type: 'success',
            name: file.name,
            size: file.size,
            uri: URL.createObjectURL(file),
            mimeType: file.type,
          });
        } else {
          resolve({ type: 'cancel' });
        }
      };
      input.click();
    });
  },
};

// expo-notifications mock
export const expoNotifications = {
  setNotificationHandler: (handler: any) => {},
  getPermissionsAsync: async () => ({ status: 'undetermined', canAskAgain: true }),
  requestPermissionsAsync: async () => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      return { status: permission === 'granted' ? 'granted' : 'denied' };
    }
    return { status: 'denied' };
  },
  scheduleNotificationAsync: async (content: any) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(content.content?.title || 'Notification', {
        body: content.content?.body,
      });
    }
    return 'web-notification-id';
  },
  cancelScheduledNotificationAsync: async (id: string) => {},
  cancelAllScheduledNotificationsAsync: async () => {},
  getAllScheduledNotificationsAsync: async () => [],
  getExpoPushTokenAsync: async () => ({ data: 'web-push-token' }),
  addNotificationReceivedListener: (listener: any) => ({ remove: () => {} }),
  addNotificationResponseReceivedListener: (listener: any) => ({ remove: () => {} }),
};

// expo-clipboard mock
export const expoClipboard = {
  setStringAsync: async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      return true;
    }
  },
  getStringAsync: async () => {
    try {
      return await navigator.clipboard.readText();
    } catch {
      return '';
    }
  },
  hasStringAsync: async () => {
    try {
      const text = await navigator.clipboard.readText();
      return text.length > 0;
    } catch {
      return false;
    }
  },
};

// expo-background-fetch mock (no-op on web)
export const expoBackgroundFetch = {
  BackgroundFetchResult: {
    NoData: 1,
    NewData: 2,
    Failed: 3,
  },
  BackgroundFetchStatus: {
    Denied: 1,
    Restricted: 2,
    Available: 3,
  },
  getStatusAsync: async () => 3, // Available
  registerTaskAsync: async (taskName: string, options?: any) => {
    if (process.env.NODE_ENV === 'development') {
      console.debug(`[BackgroundFetch] registerTask(${taskName}) - not supported on web`);
    }
  },
  unregisterTaskAsync: async (taskName: string) => {
    if (process.env.NODE_ENV === 'development') {
      console.debug(`[BackgroundFetch] unregisterTask(${taskName}) - not supported on web`);
    }
  },
};

// expo-task-manager mock
// Background tasks require service workers on web - not implemented
export const expoTaskManager = {
  defineTask: (taskName: string, taskExecutor: any) => {
    if (process.env.NODE_ENV === 'development') {
      console.debug(`[TaskManager] defineTask(${taskName}) - not supported on web`);
    }
  },
  isTaskRegisteredAsync: async (taskName: string) => false,
  getTaskOptionsAsync: async (taskName: string) => null,
  unregisterAllTasksAsync: async () => {
    if (process.env.NODE_ENV === 'development') {
      console.debug('[TaskManager] unregisterAllTasks - not supported on web');
    }
  },
  unregisterTaskAsync: async (taskName: string) => {
    if (process.env.NODE_ENV === 'development') {
      console.debug(`[TaskManager] unregisterTask(${taskName}) - not supported on web`);
    }
  },
};

// expo-secure-store mock - uses improved secure storage with encryption
// See expo-secure-store-mock.ts for full implementation
export const expoSecureStore = secureStoreMock;

// expo-image-picker mock - uses native file input on web
// See expo-image-picker-mock.ts for full implementation
export const expoImagePicker = imagePickerMock;

// expo-camera mock - uses MediaDevices API on web
// See expo-camera-mock.ts for full implementation
export const expoCamera = cameraMock;

// expo-location mock
export const expoLocation = {
  requestForegroundPermissionsAsync: async () => {
    if ('geolocation' in navigator) {
      return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
          () => resolve({ status: 'granted' }),
          () => resolve({ status: 'denied' })
        );
      });
    }
    return { status: 'denied' };
  },
  getCurrentPositionAsync: async (options?: any) => {
    return new Promise((resolve, reject) => {
      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            resolve({
              coords: {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                altitude: position.coords.altitude,
                accuracy: position.coords.accuracy,
                altitudeAccuracy: position.coords.altitudeAccuracy,
                heading: position.coords.heading,
                speed: position.coords.speed,
              },
              timestamp: position.timestamp,
            });
          },
          (error) => reject(error)
        );
      } else {
        reject(new Error('Geolocation not available'));
      }
    });
  },
  watchPositionAsync: async (options: any, callback: any) => {
    if ('geolocation' in navigator) {
      const watchId = navigator.geolocation.watchPosition(
        (position) => {
          callback({
            coords: {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              altitude: position.coords.altitude,
              accuracy: position.coords.accuracy,
              altitudeAccuracy: position.coords.altitudeAccuracy,
              heading: position.coords.heading,
              speed: position.coords.speed,
            },
            timestamp: position.timestamp,
          });
        },
        (error) => console.error('Location error:', error)
      );
      return { remove: () => navigator.geolocation.clearWatch(watchId) };
    }
    return { remove: () => {} };
  },
  Accuracy: {
    Lowest: 1,
    Low: 2,
    Balanced: 3,
    High: 4,
    Highest: 5,
    BestForNavigation: 6,
  },
};

// expo-localization mock
export const expoLocalization = {
  locale: navigator.language || 'en-US',
  locales: navigator.languages || ['en-US'],
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  isRTL: false,
  region: navigator.language?.split('-')[1] || 'US',
  isoCurrencyCodes: ['USD', 'EUR', 'GBP', 'INR'],
  getLocales: () => [{
    languageTag: navigator.language || 'en-US',
    languageCode: navigator.language?.split('-')[0] || 'en',
    regionCode: navigator.language?.split('-')[1] || 'US',
    textDirection: 'ltr',
    digitGroupingSeparator: ',',
    decimalSeparator: '.',
    measurementSystem: 'metric',
    currencyCode: 'USD',
    currencySymbol: '$',
    temperatureUnit: 'fahrenheit',
  }],
  getCalendars: () => [{
    calendar: 'gregorian',
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    uses24hourClock: false,
    firstWeekday: 1,
  }],
};

export default {
  documentPicker: expoDocumentPicker,
  notifications: expoNotifications,
  clipboard: expoClipboard,
  backgroundFetch: expoBackgroundFetch,
  taskManager: expoTaskManager,
  secureStore: expoSecureStore,
  imagePicker: expoImagePicker,
  camera: expoCamera,
  location: expoLocation,
  localization: expoLocalization,
};
