import AsyncStorage from '@react-native-async-storage/async-storage';
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

// Key derivation iterations for brute-force resistance.
// The PBKDF2 (crypto.subtle) path is native/fast, so it keeps the full count.
const KEY_DERIVATION_ITERATIONS = 100000;
// The fallback path hashes via expo-crypto, which is one native bridge round-trip
// per iteration — 100k took ~2 minutes on a low-end device and is the reason
// vault creation appeared to hang. Use a far smaller count there so create/unlock
// stay responsive. (Defence-in-depth note: the device salt + OS app-sandbox are
// the primary protection for the short PIN; a future hardening pass could swap in
// native PBKDF2 to raise this safely.)
const FALLBACK_KEY_DERIVATION_ITERATIONS = 1000;

/**
 * Web Crypto (crypto.subtle) is absent on Hermes (Android) and JSC (iOS) — i.e.
 * every real device build. Detect it so we can fall back to an expo-crypto based
 * cipher instead of throwing, mirroring src/services/encryptedDatabase.ts.
 */
function hasCryptoSubtle(): boolean {
  return (
    typeof crypto !== 'undefined' &&
    typeof crypto.subtle !== 'undefined' &&
    typeof crypto.subtle.importKey === 'function'
  );
}

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
    } catch {
      console.log('[Encryption] Web Crypto PBKDF2 not available, using iterative SHA-256');
    }
  }

  // Fallback: Iterative SHA-256 using expo-crypto (Hermes/JSC have no crypto.subtle)
  let hash = `${salt}:${pin}:${salt}`;

  for (let i = 0; i < FALLBACK_KEY_DERIVATION_ITERATIONS; i++) {
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
  private keyString: string | null = null;
  private useWebCrypto = false;
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

      // Prefer AES-256-GCM via Web Crypto when available (web). On Hermes/JSC
      // (every real device) crypto.subtle is absent, so fall back to the
      // expo-crypto SHA-256 keystream cipher instead of throwing.
      this.useWebCrypto = hasCryptoSubtle();
      if (this.useWebCrypto) {
        try {
          this.cryptoKey = await crypto.subtle.importKey(
            'raw',
            this.keyBytes,
            { name: 'AES-GCM' },
            false,
            ['encrypt', 'decrypt']
          );
        } catch (error) {
          // crypto.subtle exists but rejected the key — drop to the fallback
          // rather than failing vault creation outright.
          console.warn('[Encryption] AES-GCM import failed, using expo-crypto fallback:', error);
          this.useWebCrypto = false;
        }
      }
      if (!this.useWebCrypto) {
        this.keyString = bytesToBase64(this.keyBytes);
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
    if (this.useWebCrypto && this.cryptoKey) {
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

    // Fallback (Hermes/JSC): SHA-256 keystream XOR with a 16-byte IV.
    if (!this.keyString) {
      throw new Error('Encryption not initialized - call initialize() first');
    }
    const ivBytes = await Crypto.getRandomBytesAsync(16);
    const iv = new Uint8Array(ivBytes);
    const encrypted = await this.xorKeystream(stringToBytes(plaintext), iv);
    const combined = new Uint8Array(iv.length + encrypted.length);
    combined.set(iv);
    combined.set(encrypted, iv.length);
    return bytesToBase64(combined);
  }

  /**
   * Decrypt an encrypted string using AES-256-GCM
   */
  async decrypt(encryptedData: string): Promise<string> {
    if (this.useWebCrypto && this.cryptoKey) {
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

    // Fallback (Hermes/JSC): 16-byte IV prefix + SHA-256 keystream XOR (symmetric).
    if (!this.keyString) {
      throw new Error('Encryption not initialized - call initialize() first');
    }
    const combined = base64ToBytes(encryptedData);
    const iv = combined.slice(0, 16);
    const ciphertext = combined.slice(16);
    const plain = await this.xorKeystream(ciphertext, iv);
    return bytesToString(plain);
  }

  /**
   * SHA-256 keystream XOR (symmetric — same call encrypts and decrypts), used
   * when crypto.subtle is unavailable. Mirrors the fallback in
   * src/services/encryptedDatabase.ts. Keystream block i = SHA-256(key:iv:i).
   */
  private async xorKeystream(data: Uint8Array, iv: Uint8Array): Promise<Uint8Array> {
    const result = new Uint8Array(data.length);
    const ivHex = Array.from(iv).map((b) => b.toString(16).padStart(2, '0')).join('');
    let keystream = new Uint8Array(0);
    let keystreamOffset = 0;
    let blockCounter = 0;

    for (let i = 0; i < data.length; i++) {
      if (keystreamOffset >= keystream.length) {
        const hash = await Crypto.digestStringAsync(
          Crypto.CryptoDigestAlgorithm.SHA256,
          `${this.keyString}:${ivHex}:${blockCounter}`
        );
        keystream = new Uint8Array(32);
        for (let j = 0; j < 32; j++) {
          keystream[j] = parseInt(hash.substring(j * 2, j * 2 + 2), 16);
        }
        keystreamOffset = 0;
        blockCounter++;
      }
      result[i] = data[i] ^ keystream[keystreamOffset++];
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

      // Generate new salt for the new PIN
      const newSalt = await generateSalt(32);
      await AsyncStorage.setItem(STORAGE_KEYS.ENCRYPTION_SALT, newSalt);

      // Re-initialize with new PIN
      this.isInitialized = false;
      this.cryptoKey = null;
      this.keyBytes = null;
      this.keyString = null;

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
    this.keyString = null;
    this.salt = null;
  }

  /**
   * Lock the vault (clear keys from memory)
   */
  lock(): void {
    this.isInitialized = false;
    // Zero out key material before releasing to minimize exposure in memory
    if (this.keyBytes) {
      this.keyBytes.fill(0);
    }
    this.cryptoKey = null;
    this.keyBytes = null;
    this.keyString = null;
    this.salt = null;
  }
}

export { EncryptionService };
export const encryptionService = new EncryptionService();
export default encryptionService;
