/**
 * Web mocks for Expo packages that don't have web support
 * These provide no-op or localStorage-based implementations for web
 */

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
  registerTaskAsync: async (taskName: string, options?: any) => {},
  unregisterTaskAsync: async (taskName: string) => {},
};

// expo-task-manager mock (no-op on web)
export const expoTaskManager = {
  defineTask: (taskName: string, taskExecutor: any) => {},
  isTaskRegisteredAsync: async (taskName: string) => false,
  getTaskOptionsAsync: async (taskName: string) => null,
  unregisterAllTasksAsync: async () => {},
  unregisterTaskAsync: async (taskName: string) => {},
};

// expo-secure-store mock (uses localStorage with warning)
export const expoSecureStore = {
  setItemAsync: async (key: string, value: string) => {
    console.warn('[SecureStore] Using localStorage on web - not secure for production');
    localStorage.setItem(`secure_${key}`, value);
  },
  getItemAsync: async (key: string) => {
    return localStorage.getItem(`secure_${key}`);
  },
  deleteItemAsync: async (key: string) => {
    localStorage.removeItem(`secure_${key}`);
  },
  WHEN_UNLOCKED: 'WHEN_UNLOCKED',
  AFTER_FIRST_UNLOCK: 'AFTER_FIRST_UNLOCK',
  ALWAYS: 'ALWAYS',
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
  WHEN_PASSCODE_SET_THIS_DEVICE_ONLY: 'WHEN_PASSCODE_SET_THIS_DEVICE_ONLY',
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY',
  ALWAYS_THIS_DEVICE_ONLY: 'ALWAYS_THIS_DEVICE_ONLY',
};

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
  location: expoLocation,
  localization: expoLocalization,
};
