import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { gcm } from '@noble/ciphers/aes.js';
import { pbkdf2 } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';

/**
 * Encryption Service for Knowledge Vault
 *
 * Uses AES-256-GCM (authenticated encryption) for sensitive data at rest.
 * The encryption key is derived from a user PIN + device-specific salt using
 * PBKDF2-SHA256 (100,000 iterations).
 *
 * Two cipher backends, same security level:
 * - Web Crypto API (crypto.subtle) when available (web platform): native
 *   AES-GCM + PBKDF2.
 * - @noble/ciphers + @noble/hashes when crypto.subtle is unavailable
 *   (Hermes on Android, JSC on iOS — i.e. every real device): audited
 *   pure-JS AES-256-GCM + PBKDF2, runs in-engine with no native modules.
 */

const STORAGE_KEYS = {
  ENCRYPTION_KEY_CHECK: '@karuna/vault_key_check',
  ENCRYPTION_SALT: '@karuna/vault_salt',
  // DEK (data encryption key) wrapped under the PIN-derived key. Decoupling the
  // data key from the PIN lets the PIN change (and, later, recovery re-key) without
  // re-encrypting vault data. See docs/VAULT_PIN_RECOVERY_DESIGN.md (H3).
  WRAPPED_DEK: '@karuna/vault_wrapped_dek',
};

// PBKDF2-SHA256 iterations for brute-force resistance. Both backends (native
// Web Crypto and in-engine noble) are fast enough for the full count.
const KEY_DERIVATION_ITERATIONS = 100000;
// Iteration count used by the pre-hardening expo-crypto fallback. Kept ONLY to
// unlock + migrate vaults created before the noble hardening (2026-09-21).
const LEGACY_FALLBACK_KEY_DERIVATION_ITERATIONS = 1000;

/*
 * SECURITY — vault crypto (hardened 2026-09-21)
 * --------------------------------------------
 * crypto.subtle is unavailable on Hermes (Android) and JSC (iOS), so on real
 * devices the vault previously fell back to a SHA-256 keystream XOR with no
 * authentication and a 1,000-iteration KDF — both flagged HIGH. That fallback
 * is gone. The no-subtle path now uses audited pure-JS primitives that run
 * in-engine on Hermes/JSC with no native build risk:
 *
 *   1. AES-256-GCM via @noble/ciphers (real AEAD). Ciphertext is tamper-evident:
 *      any bit-flip fails tag verification and decrypt() throws.
 *   2. PBKDF2-SHA256 at 100,000 iterations via @noble/hashes (<1s on device).
 *
 * Record format is versioned (see RECORD_VERSION_V1). Records written before
 * the hardening (unversioned 16-byte-IV XOR) are still readable: on unlock,
 * after the PIN is verified against them with the legacy KDF, they are
 * transparently re-encrypted with AES-256-GCM. The legacy decrypt code below
 * exists ONLY for that migration.
 *
 * Remaining accepted risks:
 *   - A 4–6 digit PIN is low-entropy. The per-device salt + OS app sandbox are
 *     the primary protection against offline brute force; prefer a longer PIN
 *     for sensitive vaults.
 *   - Bulk vault data records written pre-hardening stay XOR-encrypted until
 *     the next save (decrypt() still reads them; every save re-encrypts).
 */

// Encrypted-record format markers.
//
// v1 layout: magic(4) || ver(1) || iv(12) || ciphertext || tag(16), base64.
// The 4-byte magic ('KARV') + version byte replaces the earlier 1-byte 0x01
// marker: a legacy XOR record's random 16-byte IV prefix matched 0x01 with
// probability 1/256 and would have been misclassified as v1 (then failed tag
// verification, making a legitimate old record unreadable). A 5-byte header
// collides with probability 2^-40 — negligible.
// Both the Web Crypto and the noble encrypt paths write this exact layout,
// so "new records are versioned" holds on every platform.
const RECORD_MAGIC = [0x4b, 0x41, 0x52, 0x56]; // 'KARV'
const RECORD_VERSION_V1 = 0x01; // AES-256-GCM
const V1_HEADER_LENGTH = RECORD_MAGIC.length + 1; // 5
const GCM_IV_LENGTH = 12;
const GCM_TAG_LENGTH = 16;
const V1_OVERHEAD = V1_HEADER_LENGTH + GCM_IV_LENGTH + GCM_TAG_LENGTH; // 33

/**
 * True when the stored record uses the v1 (AES-256-GCM) format.
 * Unversioned records are either Web Crypto AES-GCM (web, pre-versioning) or
 * legacy XOR (pre-hardening devices) and are handled by the platform/migration
 * paths.
 */
function isV1Record(data: string): boolean {
  try {
    return isV1RecordBytes(base64ToBytes(data));
  } catch {
    return false;
  }
}

/** Byte-level v1 check (avoids re-decoding in decrypt()). */
function isV1RecordBytes(bytes: Uint8Array): boolean {
  return (
    // >= : an empty-plaintext record is exactly V1_OVERHEAD bytes
    // (header + iv + tag, no ciphertext); `>` would misroute it to the
    // legacy path, where the misaligned IV fails the GCM tag check.
    bytes.length >= V1_OVERHEAD &&
    bytes[0] === RECORD_MAGIC[0] &&
    bytes[1] === RECORD_MAGIC[1] &&
    bytes[2] === RECORD_MAGIC[2] &&
    bytes[3] === RECORD_MAGIC[3] &&
    bytes[4] === RECORD_VERSION_V1
  );
}

/** Prepend the v1 header (magic + version) to iv || ciphertext. */
function addV1Header(ivAndCiphertext: Uint8Array): Uint8Array {
  const combined = new Uint8Array(V1_HEADER_LENGTH + ivAndCiphertext.length);
  combined.set(RECORD_MAGIC, 0);
  combined[V1_HEADER_LENGTH - 1] = RECORD_VERSION_V1;
  combined.set(ivAndCiphertext, V1_HEADER_LENGTH);
  return combined;
}

/**
 * Web Crypto (crypto.subtle) is absent on Hermes (Android) and JSC (iOS) — i.e.
 * every real device build. Detect it so we can use the noble in-engine cipher
 * instead of throwing, mirroring src/services/encryptedDatabase.ts.
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
 * Derive a 256-bit key from a PIN using PBKDF2-SHA256 (100,000 iterations).
 * Uses Web Crypto when available, otherwise the in-engine noble implementation
 * (same algorithm, same iteration count, same output).
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
        pinBytes as BufferSource,
        'PBKDF2',
        false,
        ['deriveBits']
      );

      // Derive 256-bit key using PBKDF2-SHA256
      const derivedBits = await crypto.subtle.deriveBits(
        {
          name: 'PBKDF2',
          salt: saltBytes as BufferSource,
          iterations: KEY_DERIVATION_ITERATIONS,
          hash: 'SHA-256',
        },
        keyMaterial,
        256
      );

      return new Uint8Array(derivedBits);
    } catch {
      console.log('[Encryption] Web Crypto PBKDF2 not available, using noble PBKDF2');
    }
  }

  // In-engine PBKDF2-SHA256 via @noble/hashes (Hermes/JSC have no crypto.subtle)
  return pbkdf2(sha256, stringToBytes(pin), stringToBytes(salt), {
    c: KEY_DERIVATION_ITERATIONS,
    dkLen: 32,
  });
}

/**
 * Legacy key derivation (pre-hardening): iterative SHA-256 via the expo-crypto
 * bridge at 1,000 iterations. Kept ONLY to verify the PIN against — and migrate
 * — vaults created before the noble hardening. Never used for new records.
 */
async function deriveKeyLegacy(pin: string, salt: string): Promise<Uint8Array> {
  let hash = `${salt}:${pin}:${salt}`;

  for (let i = 0; i < LEGACY_FALLBACK_KEY_DERIVATION_ITERATIONS; i++) {
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
  private useWebCrypto = false;
  private isInitialized = false;

  /**
   * Load the given raw key bytes as the active cipher key (AES-GCM via subtle
   * when available, else the in-engine noble AES-GCM).
   */
  private async setActiveKey(keyBytes: Uint8Array): Promise<void> {
    this.keyBytes = keyBytes;
    this.useWebCrypto = hasCryptoSubtle();
    this.cryptoKey = null;
    if (this.useWebCrypto) {
      try {
        this.cryptoKey = await crypto.subtle.importKey(
          'raw',
          keyBytes as BufferSource,
          { name: 'AES-GCM' },
          false,
          ['encrypt', 'decrypt']
        );
      } catch (error) {
        console.warn('[Encryption] AES-GCM import failed, using noble AES-GCM:', error);
        this.useWebCrypto = false;
      }
    }
  }

  /**
   * AES-256-GCM encrypt with the in-engine noble cipher. Output is the v1
   * versioned record: magic(4) || ver(1) || iv(12) || ciphertext || tag(16),
   * base64-encoded.
   */
  private async nobleEncrypt(plaintext: string, keyBytes: Uint8Array): Promise<string> {
    const iv = await generateIV();
    const ctWithTag = gcm(keyBytes, iv).encrypt(stringToBytes(plaintext));
    const ivAndCt = new Uint8Array(GCM_IV_LENGTH + ctWithTag.length);
    ivAndCt.set(iv, 0);
    ivAndCt.set(ctWithTag, GCM_IV_LENGTH);
    return bytesToBase64(addV1Header(ivAndCt));
  }

  /**
   * AES-256-GCM decrypt with the in-engine noble cipher. Throws when the
   * authentication tag does not verify (wrong key or tampered record).
   */
  private nobleDecryptBytes(combined: Uint8Array, keyBytes: Uint8Array): string {
    const iv = combined.slice(V1_HEADER_LENGTH, V1_HEADER_LENGTH + GCM_IV_LENGTH);
    const ctWithTag = combined.slice(V1_HEADER_LENGTH + GCM_IV_LENGTH);
    const plain = gcm(keyBytes, iv).decrypt(ctWithTag);
    return bytesToString(plain);
  }

  /**
   * Legacy decrypt (pre-hardening): 16-byte IV prefix + SHA-256 keystream XOR.
   * Exists ONLY for the unlock-time migration in initialize(). Never used to
   * encrypt new records.
   */
  private async legacyXorDecryptBytes(combined: Uint8Array, keyBytes: Uint8Array): Promise<string> {
    const iv = combined.slice(0, 16);
    const ciphertext = combined.slice(16);
    const plain = await this.xorKeystream(ciphertext, iv, bytesToBase64(keyBytes));
    return bytesToString(plain);
  }

  /**
   * Initialize encryption with a user PIN.
   *
   * Uses a DEK (data encryption key) decoupled from the PIN: the PIN-derived key
   * only wraps/unwraps the DEK; all vault data is encrypted under the DEK. This
   * lets the PIN change (and caregiver-assisted recovery, later) re-key without
   * re-encrypting data. Legacy vaults (data encrypted directly under the
   * PIN-derived key, no wrapped DEK) are migrated in place by *freezing* that
   * key as the DEK and wrapping it — so no vault data is ever re-encrypted.
   * See docs/VAULT_PIN_RECOVERY_DESIGN.md (H3).
   *
   * Records written before the 2026-09-21 crypto hardening (unversioned XOR)
   * are verified with the legacy KDF, then transparently re-encrypted with
   * AES-256-GCM during unlock.
   */
  async initialize(pin: string): Promise<boolean> {
    try {
      // Get or create salt
      let salt = await AsyncStorage.getItem(STORAGE_KEYS.ENCRYPTION_SALT);
      if (!salt) {
        salt = await generateSalt(32);
        await AsyncStorage.setItem(STORAGE_KEYS.ENCRYPTION_SALT, salt);
      }

      // Derive the PIN key (used only to wrap/unwrap the DEK).
      const pinKeyBytes = await deriveKey(pin, salt);

      const wrapped = await AsyncStorage.getItem(STORAGE_KEYS.WRAPPED_DEK);
      const keyCheck = await AsyncStorage.getItem(STORAGE_KEYS.ENCRYPTION_KEY_CHECK);
      let dekBytes: Uint8Array;

      if (wrapped && isV1Record(wrapped)) {
        // Current-format vault: unwrap the DEK. Tag failure = wrong PIN.
        try {
          dekBytes = base64ToBytes(this.nobleDecryptBytes(base64ToBytes(wrapped), pinKeyBytes));
        } catch {
          console.error('Invalid PIN - DEK unwrap failed');
          return false;
        }
        if (dekBytes.length !== 32) {
          console.error('Invalid PIN - DEK unwrap failed');
          return false;
        }
      } else if (wrapped && hasCryptoSubtle()) {
        // Web-platform vault (Web Crypto AES-GCM, unversioned). Same KDF as
        // before, so the PIN key is unchanged.
        await this.setActiveKey(pinKeyBytes);
        try {
          dekBytes = base64ToBytes(await this.decrypt(wrapped));
        } catch {
          console.error('Invalid PIN - DEK unwrap failed');
          return false;
        }
      } else if (wrapped) {
        // Legacy device vault (pre-hardening XOR records): verify the PIN with
        // the legacy KDF, then migrate the records to AES-256-GCM.
        const oldPinKey = await deriveKeyLegacy(pin, salt);
        let dekB64: string;
        try {
          dekB64 = await this.legacyXorDecryptBytes(base64ToBytes(wrapped), oldPinKey);
        } catch {
          console.error('Invalid PIN - legacy DEK unwrap failed');
          return false;
        }
        let candidateDek: Uint8Array;
        try {
          candidateDek = base64ToBytes(dekB64);
        } catch {
          console.error('Invalid PIN - legacy DEK unwrap failed');
          return false;
        }
        if (candidateDek.length !== 32) {
          console.error('Invalid PIN - legacy DEK unwrap failed');
          return false;
        }
        // Verify against the legacy key check (XOR under the DEK) BEFORE
        // migrating anything — a wrong PIN yields garbage here, not a throw.
        if (!keyCheck) {
          console.error('Vault is corrupted - missing key check');
          return false;
        }
        try {
          if (await this.legacyXorDecryptBytes(base64ToBytes(keyCheck), candidateDek) !== 'KARUNA_VAULT_KEY_VALID') {
            console.error('Invalid PIN - decryption failed');
            return false;
          }
        } catch {
          console.error('Invalid PIN - decryption error');
          return false;
        }
        dekBytes = candidateDek;
        // Migrate: re-wrap the DEK under the hardened PIN key and re-encrypt
        // the key check under the DEK, both as v1 records. Bulk vault data
        // stays XOR-encrypted until its next save; decrypt() still reads it.
        await AsyncStorage.setItem(
          STORAGE_KEYS.WRAPPED_DEK,
          await this.nobleEncrypt(bytesToBase64(dekBytes), pinKeyBytes)
        );
        await AsyncStorage.setItem(
          STORAGE_KEYS.ENCRYPTION_KEY_CHECK,
          await this.nobleEncrypt('KARUNA_VAULT_KEY_VALID', dekBytes)
        );
      } else if (keyCheck) {
        // Pre-DEK legacy vault: data encrypted directly under the PIN key (XOR).
        // Verify the PIN against the key check FIRST (before writing anything),
        // then freeze the legacy PIN key as the DEK and wrap it — no data
        // re-encryption needed.
        const oldPinKey = await deriveKeyLegacy(pin, salt);
        try {
          if (await this.legacyXorDecryptBytes(base64ToBytes(keyCheck), oldPinKey) !== 'KARUNA_VAULT_KEY_VALID') {
            console.error('Invalid PIN - decryption failed');
            return false;
          }
        } catch {
          console.error('Invalid PIN - decryption error');
          return false;
        }
        dekBytes = oldPinKey;
        await AsyncStorage.setItem(
          STORAGE_KEYS.WRAPPED_DEK,
          await this.nobleEncrypt(bytesToBase64(dekBytes), pinKeyBytes)
        );
        await AsyncStorage.setItem(
          STORAGE_KEYS.ENCRYPTION_KEY_CHECK,
          await this.nobleEncrypt('KARUNA_VAULT_KEY_VALID', dekBytes)
        );
      } else {
        // Brand-new vault: random DEK, wrapped under the PIN key (v1 record).
        dekBytes = new Uint8Array(await Crypto.getRandomBytesAsync(32));
        await AsyncStorage.setItem(
          STORAGE_KEYS.WRAPPED_DEK,
          await this.nobleEncrypt(bytesToBase64(dekBytes), pinKeyBytes)
        );
      }

      // Switch the active key to the DEK for all subsequent data operations.
      await this.setActiveKey(dekBytes);

      // Key check (under the DEK) — integrity guard.
      const finalKeyCheck = await AsyncStorage.getItem(STORAGE_KEYS.ENCRYPTION_KEY_CHECK);
      if (finalKeyCheck) {
        try {
          if (await this.decrypt(finalKeyCheck) !== 'KARUNA_VAULT_KEY_VALID') {
            console.error('Vault key check failed - data may be corrupted');
            return false;
          }
        } catch {
          console.error('Vault key check could not be decrypted');
          return false;
        }
      } else {
        await AsyncStorage.setItem(
          STORAGE_KEYS.ENCRYPTION_KEY_CHECK,
          await this.encrypt('KARUNA_VAULT_KEY_VALID')
        );
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
   * Encrypt a string value using AES-256-GCM (authenticated encryption).
   * New records are always written in the v1 versioned format, on every
   * platform (Web Crypto and noble both emit magic || ver || iv || ct || tag).
   */
  async encrypt(plaintext: string): Promise<string> {
    if (this.useWebCrypto && this.cryptoKey) {
      const iv = await generateIV();
      const data = stringToBytes(plaintext);

      // Encrypt using AES-GCM (authenticated encryption)
      const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv as BufferSource },
        this.cryptoKey,
        data as BufferSource
      );
      const ciphertext = new Uint8Array(encrypted);

      // Combine IV + ciphertext, then prepend the v1 header
      const ivAndCt = new Uint8Array(iv.length + ciphertext.length);
      ivAndCt.set(iv);
      ivAndCt.set(ciphertext, iv.length);

      return bytesToBase64(addV1Header(ivAndCt));
    }

    // In-engine AES-256-GCM via @noble/ciphers (Hermes/JSC have no crypto.subtle)
    if (!this.keyBytes) {
      throw new Error('Encryption not initialized - call initialize() first');
    }
    return this.nobleEncrypt(plaintext, this.keyBytes);
  }

  /**
   * Decrypt an encrypted string using AES-256-GCM.
   *
   * Format auto-detection:
   * - v1 versioned records (magic 'KARV' + version byte) → AES-256-GCM via the
   *   in-engine noble cipher on every platform (keyBytes is always set after
   *   initialize(); noble and Web Crypto emit byte-identical AES-GCM records).
   *   Throws on tamper / wrong key.
   * - unversioned records on web → legacy Web Crypto AES-GCM (iv12 || ct),
   *   written before records were versioned.
   * - unversioned records on device → legacy XOR (pre-hardening records only;
   *   kept readable so old vault data migrates on next save).
   */
  async decrypt(encryptedData: string): Promise<string> {
    const combined = base64ToBytes(encryptedData);

    if (isV1RecordBytes(combined)) {
      if (!this.keyBytes) {
        throw new Error('Encryption not initialized - call initialize() first');
      }
      return this.nobleDecryptBytes(combined, this.keyBytes);
    }

    if (this.useWebCrypto && this.cryptoKey) {
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

    // Legacy (pre-hardening) device records: 16-byte IV prefix + SHA-256
    // keystream XOR. Readable for migration; never written anymore.
    if (!this.keyBytes) {
      throw new Error('Encryption not initialized - call initialize() first');
    }
    return this.legacyXorDecryptBytes(combined, this.keyBytes);
  }

  /**
   * SHA-256 keystream XOR (symmetric — same call encrypts and decrypts).
   * LEGACY ONLY: used solely to read pre-hardening records during migration.
   * Keystream block i = SHA-256(key:iv:i).
   */
  private async xorKeystream(data: Uint8Array, iv: Uint8Array, keyString: string): Promise<Uint8Array> {
    const result = new Uint8Array(data.length);
    const ivHex = Array.from(iv).map((b) => b.toString(16).padStart(2, '0')).join('');
    let keystream = new Uint8Array(0);
    let keystreamOffset = 0;
    let blockCounter = 0;

    for (let i = 0; i < data.length; i++) {
      if (keystreamOffset >= keystream.length) {
        const hash = await Crypto.digestStringAsync(
          Crypto.CryptoDigestAlgorithm.SHA256,
          `${keyString}:${ivHex}:${blockCounter}`
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
      // Verify old PIN and load the DEK (becomes the active key after initialize).
      if (!await this.initialize(oldPin)) {
        return false;
      }
      if (!this.keyBytes) return false;
      const dekBytes = this.keyBytes;

      // Re-wrap the same DEK under a new-PIN-derived key. Vault data stays
      // encrypted under the unchanged DEK, so nothing else needs re-encrypting.
      const newSalt = await generateSalt(32);
      const newPinKey = await deriveKey(newPin, newSalt);
      const newWrapped = await this.nobleEncrypt(bytesToBase64(dekBytes), newPinKey);

      // Commit new salt + wrapped DEK, then restore the DEK as the active key.
      await AsyncStorage.setItem(STORAGE_KEYS.ENCRYPTION_SALT, newSalt);
      await AsyncStorage.setItem(STORAGE_KEYS.WRAPPED_DEK, newWrapped);
      await this.setActiveKey(dekBytes);
      return true;
    } catch (error) {
      console.error('PIN change failed:', error);
      return false;
    }
  }

  /**
   * Build caregiver-assisted recovery escrow material (H3 Phase 2). Wraps the
   * current DEK under a fresh random recovery key. The device escrows
   * { wrappedDek, recoveryKey } to the gateway; on an approved recovery the
   * device fetches it back and calls restoreWithRecovery(). Requires the vault
   * to be unlocked (DEK loaded). Returns null otherwise.
   */
  async buildRecoveryEscrow(): Promise<{ wrappedDek: string; recoveryKey: string } | null> {
    if (!this.isInitialized || !this.keyBytes) return null;
    const dekBytes = this.keyBytes;
    const rkBytes = new Uint8Array(await Crypto.getRandomBytesAsync(32));
    const recoveryKey = bytesToBase64(rkBytes);
    // Wrap the DEK under the recovery key as a v1 record.
    const wrappedDek = await this.nobleEncrypt(bytesToBase64(dekBytes), rkBytes);
    return { wrappedDek, recoveryKey };
  }

  /**
   * Recover the vault from approved escrow material and re-key to a new PIN
   * (H3 Phase 3). Unwraps the DEK with the recovery key, verifies it against the
   * existing key check (so material from a different vault can't corrupt this
   * one), re-wraps the DEK under the new PIN, and leaves the vault unlocked.
   */
  async restoreWithRecovery(wrappedDek: string, recoveryKey: string, newPin: string): Promise<boolean> {
    try {
      // Unwrap the DEK using the recovery key (v1 record).
      const dekBytes = base64ToBytes(this.nobleDecryptBytes(base64ToBytes(wrappedDek), base64ToBytes(recoveryKey)));

      // Integrity guard: the recovered DEK must match this vault's data.
      const keyCheck = await AsyncStorage.getItem(STORAGE_KEYS.ENCRYPTION_KEY_CHECK);
      await this.setActiveKey(dekBytes);
      if (keyCheck) {
        try {
          if (await this.decrypt(keyCheck) !== 'KARUNA_VAULT_KEY_VALID') return false;
        } catch {
          return false;
        }
      }

      // Re-wrap the DEK under the new PIN (new salt) — data stays under the DEK.
      const newSalt = await generateSalt();
      const newPinKey = await deriveKey(newPin, newSalt);
      const newWrapped = await this.nobleEncrypt(bytesToBase64(dekBytes), newPinKey);

      await AsyncStorage.setItem(STORAGE_KEYS.ENCRYPTION_SALT, newSalt);
      await AsyncStorage.setItem(STORAGE_KEYS.WRAPPED_DEK, newWrapped);

      // Activate the DEK; ensure a key check exists (new vaults).
      await this.setActiveKey(dekBytes);
      if (!keyCheck) {
        await AsyncStorage.setItem(STORAGE_KEYS.ENCRYPTION_KEY_CHECK, await this.encrypt('KARUNA_VAULT_KEY_VALID'));
      }
      this.isInitialized = true;
      return true;
    } catch (error) {
      console.error('Recovery restore failed:', error);
      return false;
    }
  }

  /**
   * Reset the vault (deletes all encrypted data)
   */
  async resetVault(): Promise<void> {
    await AsyncStorage.removeItem(STORAGE_KEYS.ENCRYPTION_KEY_CHECK);
    await AsyncStorage.removeItem(STORAGE_KEYS.ENCRYPTION_SALT);
    await AsyncStorage.removeItem(STORAGE_KEYS.WRAPPED_DEK);
    this.isInitialized = false;
    this.cryptoKey = null;
    this.keyBytes = null;
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
  }
}

export { EncryptionService };
export const encryptionService = new EncryptionService();
export default encryptionService;
