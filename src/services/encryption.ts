import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as Crypto from 'expo-crypto';

/**
 * Encryption Service for Knowledge Vault
 *
 * Uses AES-256-GCM for encrypting sensitive data at rest.
 * The encryption key is derived from a user PIN + device-specific salt using PBKDF2-like iterations.
 *
 * This implementation uses Web Crypto API which is available on:
 * - All modern browsers (web platform)
 * - React Native 0.73+ with Hermes
 */

const STORAGE_KEYS = {
  ENCRYPTION_KEY_CHECK: '@karuna/vault_key_check',
  ENCRYPTION_SALT: '@karuna/vault_salt',
};

// Key derivation iterations for brute-force resistance
const KEY_DERIVATION_ITERATIONS = 100000;

/**
 * Generate a cryptographically secure random salt using expo-crypto
 */
async function generateSalt(length: number = 32): Promise<string> {
  const randomBytes = await Crypto.getRandomBytesAsync(length);
  // Convert to hex string for storage
  return Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Generate a cryptographically secure random IV (Initialization Vector)
 */
async function generateIV(): Promise<Uint8Array> {
  // 96 bits (12 bytes) for AES-GCM
  return await Crypto.getRandomBytesAsync(12);
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
 * Derive encryption key from PIN using iterative SHA-256 (PBKDF2-like)
 * Uses expo-crypto for cross-platform support with high iteration count
 */
async function deriveKey(pin: string, salt: string): Promise<Uint8Array> {
  // Use Web Crypto API with PBKDF2 if available (preferred)
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const pinBytes = stringToBytes(pin);
      const saltBytes = stringToBytes(salt);

      // Import PIN as key material for PBKDF2
      const keyMaterial = await crypto.subtle.importKey(
        'raw',
        pinBytes,
        'PBKDF2',
        false,
        ['deriveBits']
      );

      // Derive 256-bit key using PBKDF2-SHA256
      const derivedBits = await crypto.subtle.deriveBits(
        {
          name: 'PBKDF2',
          salt: saltBytes,
          iterations: KEY_DERIVATION_ITERATIONS,
          hash: 'SHA-256',
        },
        keyMaterial,
        256
      );

      return new Uint8Array(derivedBits);
    } catch (error) {
      console.log('[Encryption] Web Crypto PBKDF2 not available, using iterative SHA-256');
    }
  }

  // Fallback: Iterative SHA-256 using expo-crypto (still secure, just slower in JS)
  let hash = `${salt}:${pin}:${salt}`;

  for (let i = 0; i < KEY_DERIVATION_ITERATIONS; i++) {
    hash = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      hash + i.toString()
    );
  }

  // Convert hex string to Uint8Array
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(hash.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
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
        salt = await generateSalt(32);
        await AsyncStorage.setItem(STORAGE_KEYS.ENCRYPTION_SALT, salt);
      }
      this.salt = salt;

      // Derive key from PIN using PBKDF2 or iterative SHA-256
      this.keyBytes = await deriveKey(pin, salt);

      // Import as CryptoKey for Web Crypto API - required for AES-GCM encryption
      if (typeof crypto !== 'undefined' && crypto.subtle) {
        try {
          this.cryptoKey = await crypto.subtle.importKey(
            'raw',
            this.keyBytes,
            { name: 'AES-GCM' },
            false,
            ['encrypt', 'decrypt']
          );
        } catch (error) {
          console.error('[Encryption] Failed to import AES-GCM key:', error);
          throw new Error('Web Crypto API required for secure encryption');
        }
      } else {
        throw new Error('Web Crypto API not available - secure encryption requires a modern browser or React Native 0.73+');
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
   * Encrypt a string value using AES-256-GCM
   */
  async encrypt(plaintext: string): Promise<string> {
    if (!this.cryptoKey) {
      throw new Error('Encryption not initialized - call initialize() first');
    }

    const iv = await generateIV();
    const data = stringToBytes(plaintext);

    // Encrypt using AES-GCM (authenticated encryption)
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      this.cryptoKey,
      data
    );
    const ciphertext = new Uint8Array(encrypted);

    // Combine IV + ciphertext and encode as base64
    const combined = new Uint8Array(iv.length + ciphertext.length);
    combined.set(iv);
    combined.set(ciphertext, iv.length);

    return bytesToBase64(combined);
  }

  /**
   * Decrypt an encrypted string using AES-256-GCM
   */
  async decrypt(encryptedData: string): Promise<string> {
    if (!this.cryptoKey) {
      throw new Error('Encryption not initialized - call initialize() first');
    }

    const combined = base64ToBytes(encryptedData);
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);

    // Decrypt using AES-GCM (validates authentication tag)
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      this.cryptoKey,
      ciphertext
    );

    return bytesToString(new Uint8Array(decryptedBuffer));
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

      // Generate new salt for the new PIN
      const newSalt = await generateSalt(32);
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
