/**
 * Web/Test mock for expo-crypto
 *
 * Uses Web Crypto API when available, falls back to simple implementations for testing
 */

export const CryptoDigestAlgorithm = {
  SHA1: 'SHA-1',
  SHA256: 'SHA-256',
  SHA384: 'SHA-384',
  SHA512: 'SHA-512',
  MD5: 'MD5',
} as const;

export const CryptoEncoding = {
  HEX: 'hex',
  BASE64: 'base64',
} as const;

/**
 * Generate random bytes
 */
export async function getRandomBytesAsync(byteCount: number): Promise<Uint8Array> {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(byteCount);
    crypto.getRandomValues(bytes);
    return bytes;
  }

  // Fallback for testing
  const bytes = new Uint8Array(byteCount);
  for (let i = 0; i < byteCount; i++) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  return bytes;
}

/**
 * Generate random UUID
 */
export function randomUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  // Fallback UUID generation
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Digest string to hash
 */
export async function digestStringAsync(
  algorithm: string,
  data: string,
  options?: { encoding?: string }
): Promise<string> {
  const encoding = options?.encoding || 'hex';

  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(data);
      const hashBuffer = await crypto.subtle.digest(algorithm, dataBuffer);
      const hashArray = new Uint8Array(hashBuffer);

      if (encoding === 'base64') {
        return btoa(String.fromCharCode(...hashArray));
      }

      // Default to hex
      return Array.from(hashArray)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    } catch (error) {
      // Fall through to fallback
    }
  }

  // Fallback: simple hash for testing (NOT cryptographically secure)
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }

  const hashStr = Math.abs(hash).toString(16).padStart(8, '0');

  if (encoding === 'base64') {
    return btoa(hashStr);
  }

  // Pad to look like a real hash
  return hashStr.repeat(8).slice(0, 64);
}

/**
 * Digest bytes to hash
 */
export async function digest(
  algorithm: string,
  data: Uint8Array
): Promise<ArrayBuffer> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    return crypto.subtle.digest(algorithm, data);
  }

  // Fallback for testing
  const result = new Uint8Array(32);
  for (let i = 0; i < data.length; i++) {
    result[i % 32] ^= data[i];
  }
  return result.buffer;
}

export default {
  CryptoDigestAlgorithm,
  CryptoEncoding,
  getRandomBytesAsync,
  randomUUID,
  digestStringAsync,
  digest,
};
