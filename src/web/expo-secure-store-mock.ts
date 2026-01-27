/**
 * Web mock for expo-secure-store
 *
 * Security notes for web platform:
 * - Uses sessionStorage (clears when tab closes) for better security than localStorage
 * - Encrypts values using Web Crypto API before storing
 * - NOT equivalent to native Keychain/Keystore security
 * - Vulnerable to XSS attacks - ensure proper Content-Security-Policy
 * - Suitable for session tokens but not for long-term secrets
 */

const STORAGE_PREFIX = '__secure_store__';
const ENCRYPTION_KEY_NAME = '__secure_store_key__';

// Session encryption key (generated once per session)
let sessionKey: CryptoKey | null = null;

/**
 * Get or create a session encryption key
 * Key is stored only in memory and regenerated each session
 */
async function getSessionKey(): Promise<CryptoKey> {
  if (sessionKey) {
    return sessionKey;
  }

  // Check if we can use Web Crypto
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    // Generate a new AES-GCM key for this session
    sessionKey = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false, // Not extractable - more secure
      ['encrypt', 'decrypt']
    );
    return sessionKey;
  }

  throw new Error('Web Crypto API not available');
}

/**
 * Encrypt a value for storage
 */
async function encryptValue(value: string): Promise<string> {
  try {
    const key = await getSessionKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoder = new TextEncoder();

    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoder.encode(value)
    );

    // Combine IV + ciphertext and encode as base64
    const combined = new Uint8Array(iv.length + new Uint8Array(encrypted).length);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);

    return btoa(String.fromCharCode(...combined));
  } catch {
    // Fallback if encryption fails - store as-is with warning
    console.warn('[SecureStore] Encryption not available, storing unencrypted');
    return `unenc:${btoa(value)}`;
  }
}

/**
 * Decrypt a stored value
 */
async function decryptValue(encrypted: string): Promise<string> {
  try {
    // Check for unencrypted fallback format
    if (encrypted.startsWith('unenc:')) {
      return atob(encrypted.slice(6));
    }

    const key = await getSessionKey();
    const combined = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );

    return new TextDecoder().decode(decrypted);
  } catch {
    // If decryption fails (e.g., key changed), return null
    return '';
  }
}

export const WHEN_UNLOCKED = 'WHEN_UNLOCKED';
export const AFTER_FIRST_UNLOCK = 'AFTER_FIRST_UNLOCK';
export const ALWAYS = 'ALWAYS';
export const WHEN_UNLOCKED_THIS_DEVICE_ONLY = 'WHEN_UNLOCKED_THIS_DEVICE_ONLY';
export const WHEN_PASSCODE_SET_THIS_DEVICE_ONLY = 'WHEN_PASSCODE_SET_THIS_DEVICE_ONLY';
export const AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY = 'AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY';
export const ALWAYS_THIS_DEVICE_ONLY = 'ALWAYS_THIS_DEVICE_ONLY';

let hasShownSecurityWarning = false;

export async function setItemAsync(
  key: string,
  value: string,
  options?: {
    keychainAccessible?: string;
  }
): Promise<void> {
  if (!hasShownSecurityWarning && process.env.NODE_ENV === 'development') {
    console.warn(
      '[SecureStore] Web platform has limited secure storage. ' +
      'Data is encrypted in sessionStorage and cleared when the tab closes. ' +
      'For maximum security, use the native mobile app.'
    );
    hasShownSecurityWarning = true;
  }

  const encrypted = await encryptValue(value);
  sessionStorage.setItem(`${STORAGE_PREFIX}${key}`, encrypted);
}

export async function getItemAsync(
  key: string,
  options?: {
    keychainAccessible?: string;
  }
): Promise<string | null> {
  const encrypted = sessionStorage.getItem(`${STORAGE_PREFIX}${key}`);
  if (!encrypted) {
    return null;
  }

  const decrypted = await decryptValue(encrypted);
  return decrypted || null;
}

export async function deleteItemAsync(
  key: string,
  options?: {
    keychainAccessible?: string;
  }
): Promise<void> {
  sessionStorage.removeItem(`${STORAGE_PREFIX}${key}`);
}

export function isAvailableAsync(): Promise<boolean> {
  return Promise.resolve(typeof sessionStorage !== 'undefined');
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
