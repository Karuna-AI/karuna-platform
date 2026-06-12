/**
 * @jest-environment node
 *
 * Encryption Service Tests
 * Tests for AES-256-GCM encryption, key derivation, PIN management, and vault operations.
 *
 * Node environment is required because jsdom's window.crypto lacks crypto.subtle
 * (the Web Crypto API used by AES-256-GCM / PBKDF2). Node 18+ exposes globalThis.crypto
 * with full subtle support — no polyfill needed.
 *
 * AsyncStorage is mocked with an in-memory Map (localStorage is undefined in Node env).
 * expo-crypto is mocked via the project's web mock.
 */

// ---------------------------------------------------------------------------
// In-memory AsyncStorage mock — must be declared before any imports that
// reference @react-native-async-storage/async-storage.
// ---------------------------------------------------------------------------
const mockStore: Record<string, string | null> = {};

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => mockStore[key] ?? null),
  setItem: jest.fn(async (key: string, value: string) => { mockStore[key] = value; }),
  removeItem: jest.fn(async (key: string) => { delete mockStore[key]; }),
  clear: jest.fn(async () => { Object.keys(mockStore).forEach(k => delete mockStore[k]); }),
  multiRemove: jest.fn(async (keys: string[]) => { keys.forEach(k => delete mockStore[k]); }),
}));
// expo-crypto is already routed to src/web/expo-crypto-mock.ts via moduleNameMapper.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { encryptionService } from '../../src/services/encryption';

const SALT_KEY = '@karuna/vault_salt';
const KEY_CHECK_KEY = '@karuna/vault_key_check';

function clearMockStore() {
  Object.keys(mockStore).forEach(k => delete mockStore[k]);
}

async function freshVault(pin = '123456'): Promise<boolean> {
  await encryptionService.resetVault();
  return encryptionService.initialize(pin);
}

// Diagnostic — confirms Node's built-in webcrypto is available.
it('diagnostic: crypto.subtle is available in test environment', () => {
  expect(typeof (globalThis as any).crypto?.subtle).toBe('object');
});

describe('EncryptionService', () => {
  beforeEach(async () => {
    clearMockStore();
    await encryptionService.resetVault();
  });

  // ---------------------------------------------------------------------------
  // initialize
  // ---------------------------------------------------------------------------
  describe('initialize', () => {
    it('returns true on first-time setup and marks service as ready', async () => {
      const result = await encryptionService.initialize('my-pin-1234');

      expect(result).toBe(true);
      expect(encryptionService.isReady()).toBe(true);
    });

    it('persists a salt to AsyncStorage on first call', async () => {
      await encryptionService.initialize('pin');

      const salt = await AsyncStorage.getItem(SALT_KEY);
      expect(salt).not.toBeNull();
      expect(typeof salt).toBe('string');
      expect((salt as string).length).toBeGreaterThan(0);
    });

    it('persists a key-check ciphertext to AsyncStorage on first call', async () => {
      await encryptionService.initialize('pin');

      const keyCheck = await AsyncStorage.getItem(KEY_CHECK_KEY);
      expect(keyCheck).not.toBeNull();
    });

    it('reuses the existing salt on subsequent initializations with the same PIN', async () => {
      await encryptionService.initialize('pin');
      const saltAfterFirst = await AsyncStorage.getItem(SALT_KEY);

      // Lock and re-initialize
      encryptionService.lock();
      await encryptionService.initialize('pin');
      const saltAfterSecond = await AsyncStorage.getItem(SALT_KEY);

      expect(saltAfterFirst).toBe(saltAfterSecond);
    });

    it('returns true when the correct PIN is provided for an existing vault', async () => {
      await encryptionService.initialize('correct-pin');
      encryptionService.lock();

      const result = await encryptionService.initialize('correct-pin');
      expect(result).toBe(true);
    });

    it('returns false when the wrong PIN is provided for an existing vault', async () => {
      await encryptionService.initialize('correct-pin');
      encryptionService.lock();

      const result = await encryptionService.initialize('wrong-pin');
      expect(result).toBe(false);
    });

    it('leaves isReady() false after a wrong-PIN attempt', async () => {
      await encryptionService.initialize('correct-pin');
      encryptionService.lock();

      await encryptionService.initialize('bad-pin');
      expect(encryptionService.isReady()).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // isReady / lock
  // ---------------------------------------------------------------------------
  describe('isReady and lock', () => {
    it('isReady() is false before initialize()', () => {
      expect(encryptionService.isReady()).toBe(false);
    });

    it('isReady() becomes false after lock()', async () => {
      await encryptionService.initialize('pin');
      expect(encryptionService.isReady()).toBe(true);

      encryptionService.lock();
      expect(encryptionService.isReady()).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // encrypt / decrypt round-trip
  // ---------------------------------------------------------------------------
  describe('encrypt and decrypt', () => {
    beforeEach(async () => {
      await freshVault('test-pin');
    });

    it('encrypts plaintext to a different string', async () => {
      const plain = 'Hello, World!';
      const ciphertext = await encryptionService.encrypt(plain);

      expect(ciphertext).not.toBe(plain);
      expect(typeof ciphertext).toBe('string');
      expect(ciphertext.length).toBeGreaterThan(0);
    });

    it('decrypts ciphertext back to the original plaintext', async () => {
      const plain = 'Sensitive medical data: blood pressure 120/80';
      const ciphertext = await encryptionService.encrypt(plain);
      const decrypted = await encryptionService.decrypt(ciphertext);

      expect(decrypted).toBe(plain);
    });

    it('produces different ciphertext each call due to random IV', async () => {
      const plain = 'same input';
      const ct1 = await encryptionService.encrypt(plain);
      const ct2 = await encryptionService.encrypt(plain);

      expect(ct1).not.toBe(ct2);
    });

    it('handles empty-string round-trip correctly', async () => {
      const ct = await encryptionService.encrypt('');
      const result = await encryptionService.decrypt(ct);

      expect(result).toBe('');
    });

    it('handles strings with Unicode characters', async () => {
      const plain = 'दवाई: पैरासिटामोल 500mg — 2x daily 🩺';
      const ct = await encryptionService.encrypt(plain);
      const decrypted = await encryptionService.decrypt(ct);

      expect(decrypted).toBe(plain);
    });

    it('handles large payloads', async () => {
      const plain = 'x'.repeat(50000);
      const ct = await encryptionService.encrypt(plain);
      const decrypted = await encryptionService.decrypt(ct);

      expect(decrypted).toBe(plain);
    });

    it('throws if encrypt is called before initialize()', async () => {
      await encryptionService.resetVault();

      await expect(encryptionService.encrypt('data')).rejects.toThrow(
        'Encryption not initialized'
      );
    });

    it('throws if decrypt is called before initialize()', async () => {
      await encryptionService.resetVault();

      await expect(encryptionService.decrypt('ciphertext')).rejects.toThrow(
        'Encryption not initialized'
      );
    });

    it('rejects when decrypting with a different (wrong) key', async () => {
      const ct = await encryptionService.encrypt('secret');
      encryptionService.lock();

      // Re-init with wrong pin will fail; force a fresh vault with different pin
      await encryptionService.resetVault();
      await encryptionService.initialize('different-pin');

      await expect(encryptionService.decrypt(ct)).rejects.toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // encryptObject / decryptObject
  // ---------------------------------------------------------------------------
  describe('encryptObject and decryptObject', () => {
    beforeEach(async () => {
      await freshVault('obj-pin');
    });

    it('serializes and round-trips a plain object', async () => {
      const obj = { name: 'Aadhaar', number: '1234-5678-9012', expiry: null };
      const ct = await encryptionService.encryptObject(obj);
      const result = await encryptionService.decryptObject<typeof obj>(ct);

      expect(result).toEqual(obj);
    });

    it('round-trips an array', async () => {
      const arr = [1, 'two', { three: true }];
      const ct = await encryptionService.encryptObject(arr);
      const result = await encryptionService.decryptObject<typeof arr>(ct);

      expect(result).toEqual(arr);
    });
  });

  // ---------------------------------------------------------------------------
  // hasExistingVault
  // ---------------------------------------------------------------------------
  describe('hasExistingVault', () => {
    it('returns false when no vault has been created', async () => {
      const result = await encryptionService.hasExistingVault();
      expect(result).toBe(false);
    });

    it('returns true after a vault is initialized', async () => {
      await encryptionService.initialize('pin');
      const result = await encryptionService.hasExistingVault();
      expect(result).toBe(true);
    });

    it('returns false after resetVault()', async () => {
      await encryptionService.initialize('pin');
      await encryptionService.resetVault();

      const result = await encryptionService.hasExistingVault();
      expect(result).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // resetVault
  // ---------------------------------------------------------------------------
  describe('resetVault', () => {
    it('removes both storage keys', async () => {
      await encryptionService.initialize('pin');
      await encryptionService.resetVault();

      const salt = await AsyncStorage.getItem(SALT_KEY);
      const keyCheck = await AsyncStorage.getItem(KEY_CHECK_KEY);
      expect(salt).toBeNull();
      expect(keyCheck).toBeNull();
    });

    it('clears the in-memory state', async () => {
      await encryptionService.initialize('pin');
      await encryptionService.resetVault();

      expect(encryptionService.isReady()).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // changePin
  // ---------------------------------------------------------------------------
  describe('changePin', () => {
    it('returns false when old PIN is wrong', async () => {
      await encryptionService.initialize('original-pin');
      const result = await encryptionService.changePin('wrong-pin', 'new-pin');

      expect(result).toBe(false);
    });

    it('returns true when old PIN is correct and new PIN is accepted', async () => {
      await encryptionService.initialize('original-pin');
      const result = await encryptionService.changePin('original-pin', 'new-pin');

      expect(result).toBe(true);
    });

    it('generates a new salt when the PIN changes', async () => {
      await encryptionService.initialize('original-pin');
      const saltBefore = await AsyncStorage.getItem(SALT_KEY);

      await encryptionService.changePin('original-pin', 'new-pin');
      const saltAfter = await AsyncStorage.getItem(SALT_KEY);

      expect(saltBefore).not.toBe(saltAfter);
    });

    it('old PIN no longer works after a successful PIN change', async () => {
      await encryptionService.initialize('original-pin');
      await encryptionService.changePin('original-pin', 'new-pin');
      encryptionService.lock();

      const result = await encryptionService.initialize('original-pin');
      expect(result).toBe(false);
    });

    it('new PIN works after a successful PIN change', async () => {
      await encryptionService.initialize('original-pin');
      await encryptionService.changePin('original-pin', 'new-pin');
      encryptionService.lock();

      const result = await encryptionService.initialize('new-pin');
      expect(result).toBe(true);
    });

    it('data stays readable after a PIN change (DEK is re-wrapped, not re-derived)', async () => {
      // The DEK model (H3 foundation) decouples the data key from the PIN, so a
      // PIN change must NOT orphan previously-encrypted data.
      await encryptionService.initialize('original-pin');
      const cipher = await encryptionService.encrypt('my-secret-record');

      expect(await encryptionService.changePin('original-pin', 'new-pin')).toBe(true);
      // Readable immediately after the change…
      expect(await encryptionService.decrypt(cipher)).toBe('my-secret-record');

      // …and after a lock + unlock with the new PIN.
      encryptionService.lock();
      expect(await encryptionService.initialize('new-pin')).toBe(true);
      expect(await encryptionService.decrypt(cipher)).toBe('my-secret-record');

      // The old PIN no longer unlocks the vault.
      encryptionService.lock();
      expect(await encryptionService.initialize('original-pin')).toBe(false);
    });

    it('returns false when a storage write throws during changePin', async () => {
      await encryptionService.initialize('original-pin');
      // changePin re-wraps the DEK and persists it (setItem); a write failure
      // must surface as false rather than silently leaving the PIN unchanged.
      (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('storage error'));
      const result = await encryptionService.changePin('original-pin', 'new-pin');
      expect(result).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Edge cases: tampered key check and storage errors
  // ---------------------------------------------------------------------------
  describe('edge cases', () => {
    it('initialize() returns false when key check decrypts to unexpected value', async () => {
      // Set up a fresh vault and then tamper with the key check
      await encryptionService.initialize('test-pin');
      // Encrypt a different sentinel with the current key, store as key check
      const tamperedCheck = await encryptionService.encrypt('TAMPERED_VALUE');
      mockStore[KEY_CHECK_KEY] = tamperedCheck;
      encryptionService.lock();

      // Re-initialize — decryption succeeds but the plaintext won't match
      const result = await encryptionService.initialize('test-pin');
      expect(result).toBe(false);
    });

    it('initialize() returns false when AsyncStorage.getItem throws', async () => {
      (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error('storage failure'));
      const result = await encryptionService.initialize('any-pin');
      expect(result).toBe(false);
    });

    it('uses fallback key derivation when PBKDF2 deriveBits throws', async () => {
      // Force the PBKDF2 path to fail, triggering the iterative SHA-256 fallback
      const spy = jest.spyOn(globalThis.crypto.subtle, 'deriveBits').mockRejectedValueOnce(
        new Error('PBKDF2 not supported')
      );
      try {
        const result = await encryptionService.initialize('fallback-pin');
        // Service should still initialize successfully via the fallback path
        expect(result).toBe(true);
      } finally {
        spy.mockRestore();
      }
    });
  });

  // ── Caregiver-assisted recovery (H3 Phase 2/3) ──────────────────────────────
  describe('recovery escrow', () => {
    it('round-trips: build escrow → restore with new PIN → data readable, old PIN dead', async () => {
      await encryptionService.initialize('pin-1');
      const cipher = await encryptionService.encrypt('vault-secret');

      const escrow = await encryptionService.buildRecoveryEscrow();
      expect(escrow).toBeTruthy();
      expect(escrow!.wrappedDek).toBeTruthy();
      expect(escrow!.recoveryKey).toBeTruthy();

      // Simulate forgot-PIN: lock, then recover with the escrow material + a new PIN.
      encryptionService.lock();
      const ok = await encryptionService.restoreWithRecovery(escrow!.wrappedDek, escrow!.recoveryKey, 'pin-2');
      expect(ok).toBe(true);

      // Data encrypted before recovery is still readable (same DEK).
      expect(await encryptionService.decrypt(cipher)).toBe('vault-secret');

      // New PIN unlocks after a lock; the old PIN no longer works.
      encryptionService.lock();
      expect(await encryptionService.initialize('pin-2')).toBe(true);
      expect(await encryptionService.decrypt(cipher)).toBe('vault-secret');
      encryptionService.lock();
      expect(await encryptionService.initialize('pin-1')).toBe(false);
    });

    it('buildRecoveryEscrow returns null when the vault is locked', async () => {
      encryptionService.lock();
      expect(await encryptionService.buildRecoveryEscrow()).toBeNull();
    });

    it('rejects recovery material that does not match this vault', async () => {
      await encryptionService.initialize('pin-1');
      const zeros = Buffer.alloc(32).toString('base64'); // a 32-byte recovery key that wraps nothing valid
      const ok = await encryptionService.restoreWithRecovery('bogus-ciphertext', zeros, 'pin-2');
      expect(ok).toBe(false);
    });

    it('writes a fresh key check when none exists (vault recovered before first check)', async () => {
      await encryptionService.initialize('pin-1');
      const cipher = await encryptionService.encrypt('vault-secret');
      const escrow = await encryptionService.buildRecoveryEscrow();
      expect(escrow).toBeTruthy();

      await AsyncStorage.removeItem(KEY_CHECK_KEY);
      encryptionService.lock();

      const ok = await encryptionService.restoreWithRecovery(escrow!.wrappedDek, escrow!.recoveryKey, 'pin-2');
      expect(ok).toBe(true);
      // A new key check was created and the DEK still decrypts old data.
      expect(mockStore[KEY_CHECK_KEY]).toBeTruthy();
      expect(await encryptionService.decrypt(cipher)).toBe('vault-secret');
    });

    it('returns false when the stored key check cannot be decrypted', async () => {
      await encryptionService.initialize('pin-1');
      const escrow = await encryptionService.buildRecoveryEscrow();
      expect(escrow).toBeTruthy();

      mockStore[KEY_CHECK_KEY] = 'not-a-valid-ciphertext!!';
      encryptionService.lock();

      const ok = await encryptionService.restoreWithRecovery(escrow!.wrappedDek, escrow!.recoveryKey, 'pin-2');
      expect(ok).toBe(false);
    });
  });

  describe('changePin defensive branches', () => {
    it('returns false if the DEK is missing after old-PIN verification', async () => {
      await encryptionService.initialize('1111');
      encryptionService.lock(); // keyBytes now null
      // Force the unreachable-in-practice state: initialize "succeeds" without
      // loading a DEK. changePin must bail rather than wrap a missing key.
      const spy = jest.spyOn(encryptionService, 'initialize').mockResolvedValueOnce(true);
      const ok = await encryptionService.changePin('1111', '2222');
      expect(ok).toBe(false);
      spy.mockRestore();
    });
  });
});
