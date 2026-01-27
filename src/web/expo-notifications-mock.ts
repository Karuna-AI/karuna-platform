/**
 * Web mock for expo-notifications
 *
 * Web limitations:
 * - Uses browser Notification API (limited compared to native)
 * - No scheduled notifications (browser doesn't support)
 * - No push token (would require service worker)
 * - Listeners are no-ops (no native notification events)
 */

let hasShownWebWarning = false;
const showWebLimitationWarning = (feature: string) => {
  if (!hasShownWebWarning && process.env.NODE_ENV === 'development') {
    console.debug(`[Notifications] ${feature} - limited on web platform`);
  }
};

type NotificationHandler = {
  handleNotification: (notification: any) => Promise<{
    shouldShowAlert: boolean;
    shouldPlaySound: boolean;
    shouldSetBadge: boolean;
  }>;
};

let notificationHandler: NotificationHandler | null = null;

export function setNotificationHandler(handler: NotificationHandler | null) {
  notificationHandler = handler;
}

export async function getPermissionsAsync() {
  if (!('Notification' in window)) {
    return { status: 'denied', canAskAgain: false };
  }
  const permission = Notification.permission;
  return {
    status: permission === 'granted' ? 'granted' : permission === 'denied' ? 'denied' : 'undetermined',
    canAskAgain: permission !== 'denied',
  };
}

export async function requestPermissionsAsync() {
  if (!('Notification' in window)) {
    return { status: 'denied' };
  }
  const permission = await Notification.requestPermission();
  return { status: permission === 'granted' ? 'granted' : 'denied' };
}

export async function scheduleNotificationAsync(request: {
  content: {
    title?: string;
    body?: string;
    data?: any;
  };
  trigger?: any;
}) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(request.content.title || 'Notification', {
      body: request.content.body,
      data: request.content.data,
    });
  }
  return `web-notification-${Date.now()}`;
}

export async function cancelScheduledNotificationAsync(identifier: string) {
  showWebLimitationWarning('cancelScheduledNotification');
  // Browser doesn't support scheduled notification cancellation
}

export async function cancelAllScheduledNotificationsAsync() {
  showWebLimitationWarning('cancelAllScheduledNotifications');
  // Browser doesn't support scheduled notification cancellation
}

export async function getAllScheduledNotificationsAsync() {
  showWebLimitationWarning('getAllScheduledNotifications');
  return []; // Browser doesn't track scheduled notifications
}

export async function getExpoPushTokenAsync() {
  showWebLimitationWarning('getExpoPushToken');
  // Push tokens require service worker setup on web
  return { data: 'web-push-token-not-supported' };
}

export function addNotificationReceivedListener(listener: (notification: any) => void) {
  showWebLimitationWarning('addNotificationReceivedListener');
  // Native notification events not available on web
  return { remove: () => {} };
}

export function addNotificationResponseReceivedListener(listener: (response: any) => void) {
  showWebLimitationWarning('addNotificationResponseReceivedListener');
  // Native notification events not available on web
  return { remove: () => {} };
}

export default {
  setNotificationHandler,
  getPermissionsAsync,
  requestPermissionsAsync,
  scheduleNotificationAsync,
  cancelScheduledNotificationAsync,
  cancelAllScheduledNotificationsAsync,
  getAllScheduledNotificationsAsync,
  getExpoPushTokenAsync,
  addNotificationReceivedListener,
  addNotificationResponseReceivedListener,
};
