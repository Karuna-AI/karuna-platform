/**
 * Web mock for expo-secure-store
 * Uses localStorage on web - NOT secure for production sensitive data
 */

const STORAGE_PREFIX = '__secure_store__';

export const WHEN_UNLOCKED = 'WHEN_UNLOCKED';
export const AFTER_FIRST_UNLOCK = 'AFTER_FIRST_UNLOCK';
export const ALWAYS = 'ALWAYS';
export const WHEN_UNLOCKED_THIS_DEVICE_ONLY = 'WHEN_UNLOCKED_THIS_DEVICE_ONLY';
export const WHEN_PASSCODE_SET_THIS_DEVICE_ONLY = 'WHEN_PASSCODE_SET_THIS_DEVICE_ONLY';
export const AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY = 'AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY';
export const ALWAYS_THIS_DEVICE_ONLY = 'ALWAYS_THIS_DEVICE_ONLY';

export async function setItemAsync(
  key: string,
  value: string,
  options?: {
    keychainAccessible?: string;
  }
): Promise<void> {
  if (process.env.NODE_ENV === 'development') {
    console.warn('[SecureStore] Using localStorage on web - data is NOT secure');
  }
  localStorage.setItem(`${STORAGE_PREFIX}${key}`, value);
}

export async function getItemAsync(
  key: string,
  options?: {
    keychainAccessible?: string;
  }
): Promise<string | null> {
  return localStorage.getItem(`${STORAGE_PREFIX}${key}`);
}

export async function deleteItemAsync(
  key: string,
  options?: {
    keychainAccessible?: string;
  }
): Promise<void> {
  localStorage.removeItem(`${STORAGE_PREFIX}${key}`);
}

export function isAvailableAsync(): Promise<boolean> {
  return Promise.resolve(typeof localStorage !== 'undefined');
}

export default {
  setItemAsync,
  getItemAsync,
  deleteItemAsync,
  isAvailableAsync,
  WHEN_UNLOCKED,
  AFTER_FIRST_UNLOCK,
  ALWAYS,
  WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  WHEN_PASSCODE_SET_THIS_DEVICE_ONLY,
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  ALWAYS_THIS_DEVICE_ONLY,
};
