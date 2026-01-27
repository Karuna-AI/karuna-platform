/**
 * Web mock for expo-notifications
 */

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
  // No-op on web
}

export async function cancelAllScheduledNotificationsAsync() {
  // No-op on web
}

export async function getAllScheduledNotificationsAsync() {
  return [];
}

export async function getExpoPushTokenAsync() {
  return { data: 'web-push-token-not-supported' };
}

export function addNotificationReceivedListener(listener: (notification: any) => void) {
  return { remove: () => {} };
}

export function addNotificationResponseReceivedListener(listener: (response: any) => void) {
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
