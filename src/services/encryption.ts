import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

/**
 * Encryption Service for Knowledge Vault
 *
 * Uses AES-256-GCM for encrypting sensitive data at rest.
 * The encryption key is derived from a user PIN + device-specific salt.
 *
 * For React Native production:
 * - Use react-native-keychain to store the master key securely
 * - Use expo-crypto or react-native-aes-crypto for native encryption
 *
 * This implementation uses Web Crypto API (works in RN with polyfill)
 */

const STORAGE_KEYS = {
  ENCRYPTION_KEY_CHECK: '@karuna/vault_key_check',
  ENCRYPTION_SALT: '@karuna/vault_salt',
};

// For web/testing, we'll use a simple implementation
// In production React Native, use native crypto libraries
const isWeb = Platform.OS === 'web';

/**
 * Generate a random string for salt
 */
function generateSalt(length: number = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const randomValues = new Uint8Array(length);

  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(randomValues);
  } else {
    // Fallback for environments without crypto
    for (let i = 0; i < length; i++) {
      randomValues[i] = Math.floor(Math.random() * 256);
    }
  }

  for (let i = 0; i < length; i++) {
    result += chars[randomValues[i] % chars.length];
  }
  return result;
}

/**
 * Generate a random IV (Initialization Vector)
 */
function generateIV(): Uint8Array {
  const iv = new Uint8Array(12); // 96 bits for AES-GCM
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(iv);
  } else {
    for (let i = 0; i < 12; i++) {
      iv[i] = Math.floor(Math.random() * 256);
    }
  }
  return iv;
}

/**
 * Convert string to Uint8Array
 */
function stringToBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

/**
 * Convert Uint8Array to string
 */
function bytesToString(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

/**
 * Convert Uint8Array to Base64
 */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert Base64 to Uint8Array
 */
function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Simple hash function for key derivation (PBKDF2-like)
 * In production, use proper PBKDF2 from native crypto
 */
async function deriveKey(pin: string, salt: string): Promise<Uint8Array> {
  // Use Web Crypto API if available
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const pinBytes = stringToBytes(pin + salt);
    const hashBuffer = await crypto.subtle.digest('SHA-256', pinBytes);
    return new Uint8Array(hashBuffer);
  }

  // Fallback: Simple hash (NOT cryptographically secure - for testing only)
  const combined = pin + salt;
  const hash = new Uint8Array(32);
  for (let i = 0; i < combined.length; i++) {
    hash[i % 32] ^= combined.charCodeAt(i);
  }
  return hash;
}

/**
 * Encryption Service Class
 */
class EncryptionService {
  private cryptoKey: CryptoKey | null = null;
  private keyBytes: Uint8Array | null = null;
  private isInitialized = false;
  private salt: string | null = null;

  /**
   * Initialize encryption with a user PIN
   */
  async initialize(pin: string): Promise<boolean> {
    try {
      // Get or create salt
      let salt = await AsyncStorage.getItem(STORAGE_KEYS.ENCRYPTION_SALT);
      if (!salt) {
        salt = generateSalt(32);
        await AsyncStorage.setItem(STORAGE_KEYS.ENCRYPTION_SALT, salt);
      }
      this.salt = salt;

      // Derive key from PIN
      this.keyBytes = await deriveKey(pin, salt);

      // Try to import as CryptoKey for Web Crypto API
      if (typeof crypto !== 'undefined' && crypto.subtle) {
        try {
          this.cryptoKey = await crypto.subtle.importKey(
            'raw',
            this.keyBytes,
            { name: 'AES-GCM' },
            false,
            ['encrypt', 'decrypt']
          );
        } catch {
          // Web Crypto not available, will use fallback
          console.log('Web Crypto not available, using fallback encryption');
        }
      }

      // Verify the PIN by trying to decrypt the key check
      const keyCheck = await AsyncStorage.getItem(STORAGE_KEYS.ENCRYPTION_KEY_CHECK);
      if (keyCheck) {
        try {
          const decrypted = await this.decrypt(keyCheck);
          if (decrypted !== 'KARUNA_VAULT_KEY_VALID') {
            console.error('Invalid PIN - decryption failed');
            return false;
          }
        } catch {
          console.error('Invalid PIN - decryption error');
          return false;
        }
      } else {
        // First time setup - save key check
        const encrypted = await this.encrypt('KARUNA_VAULT_KEY_VALID');
        await AsyncStorage.setItem(STORAGE_KEYS.ENCRYPTION_KEY_CHECK, encrypted);
      }

      this.isInitialized = true;
      return true;
    } catch (error) {
      console.error('Encryption initialization failed:', error);
      return false;
    }
  }

  /**
   * Check if encryption is initialized
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Check if a vault PIN has been set
   */
  async hasExistingVault(): Promise<boolean> {
    const keyCheck = await AsyncStorage.getItem(STORAGE_KEYS.ENCRYPTION_KEY_CHECK);
    return keyCheck !== null;
  }

  /**
   * Encrypt a string value
   */
  async encrypt(plaintext: string): Promise<string> {
    if (!this.keyBytes) {
      throw new Error('Encryption not initialized');
    }

    const iv = generateIV();
    const data = stringToBytes(plaintext);

    let ciphertext: Uint8Array;

    // Use Web Crypto if available
    if (this.cryptoKey) {
      const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        this.cryptoKey,
        data
      );
      ciphertext = new Uint8Array(encrypted);
    } else {
      // Fallback: XOR encryption (NOT secure - for testing only)
      // In production, use react-native-aes-crypto
      ciphertext = this.xorEncrypt(data, this.keyBytes, iv);
    }

    // Combine IV + ciphertext and encode as base64
    const combined = new Uint8Array(iv.length + ciphertext.length);
    combined.set(iv);
    combined.set(ciphertext, iv.length);

    return bytesToBase64(combined);
  }

  /**
   * Decrypt an encrypted string
   */
  async decrypt(encryptedData: string): Promise<string> {
    if (!this.keyBytes) {
      throw new Error('Encryption not initialized');
    }

    const combined = base64ToBytes(encryptedData);
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);

    let decrypted: Uint8Array;

    // Use Web Crypto if available
    if (this.cryptoKey) {
      const decryptedBuffer = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        this.cryptoKey,
        ciphertext
      );
      decrypted = new Uint8Array(decryptedBuffer);
    } else {
      // Fallback: XOR decryption
      decrypted = this.xorEncrypt(ciphertext, this.keyBytes, iv);
    }

    return bytesToString(decrypted);
  }

  /**
   * Simple XOR encryption fallback (NOT cryptographically secure)
   * This is only for testing - production should use proper AES
   */
  private xorEncrypt(data: Uint8Array, key: Uint8Array, iv: Uint8Array): Uint8Array {
    const result = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) {
      result[i] = data[i] ^ key[i % key.length] ^ iv[i % iv.length];
    }
    return result;
  }

  /**
   * Encrypt an object (JSON serializable)
   */
  async encryptObject<T>(obj: T): Promise<string> {
    const json = JSON.stringify(obj);
    return this.encrypt(json);
  }

  /**
   * Decrypt an object
   */
  async decryptObject<T>(encryptedData: string): Promise<T> {
    const json = await this.decrypt(encryptedData);
    return JSON.parse(json) as T;
  }

  /**
   * Change the vault PIN
   */
  async changePin(oldPin: string, newPin: string): Promise<boolean> {
    try {
      // Verify old PIN
      if (!await this.initialize(oldPin)) {
        return false;
      }

      // Clear the old key check
      await AsyncStorage.removeItem(STORAGE_KEYS.ENCRYPTION_KEY_CHECK);

      // Generate new salt
      const newSalt = generateSalt(32);
      await AsyncStorage.setItem(STORAGE_KEYS.ENCRYPTION_SALT, newSalt);

      // Re-initialize with new PIN
      this.isInitialized = false;
      this.cryptoKey = null;
      this.keyBytes = null;

      return await this.initialize(newPin);
    } catch (error) {
      console.error('PIN change failed:', error);
      return false;
    }
  }

  /**
   * Reset the vault (deletes all encrypted data)
   */
  async resetVault(): Promise<void> {
    await AsyncStorage.removeItem(STORAGE_KEYS.ENCRYPTION_KEY_CHECK);
    await AsyncStorage.removeItem(STORAGE_KEYS.ENCRYPTION_SALT);
    this.isInitialized = false;
    this.cryptoKey = null;
    this.keyBytes = null;
    this.salt = null;
  }

  /**
   * Lock the vault (clear keys from memory)
   */
  lock(): void {
    this.isInitialized = false;
    this.cryptoKey = null;
    this.keyBytes = null;
  }
}

export const encryptionService = new EncryptionService();
export default encryptionService;
