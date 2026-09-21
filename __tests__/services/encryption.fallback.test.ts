/**
 * Tests for the Knowledge Vault encryption when the Web Crypto API
 * (crypto.subtle) is unavailable — i.e. on Hermes (Android) and JSC (iOS),
 * which is EVERY real device.
 *
 * Since the 2026-09-21 crypto hardening, the no-subtle path uses @noble/ciphers
 * (AES-256-GCM, authenticated) + @noble/hashes (PBKDF2-SHA256, 100k
 * iterations) instead of the old SHA-256 keystream XOR. These tests cover:
 * - v1 (AES-GCM) round-trips, wrong-PIN rejection, tamper detection
 * - transparent migration of pre-hardening (legacy XOR) records on unlock
 */

// jsdom in this jest setup doesn't expose TextEncoder/TextDecoder as globals;
// React Native / Expo provide them on-device (encryptedDatabase.ts already
// relies on them). Polyfill from Node's util so the cipher path can run here.
import { TextEncoder as NodeTextEncoder, TextDecoder as NodeTextDecoder } from 'util';
if (typeof (global as any).TextEncoder === 'undefined') (global as any).TextEncoder = NodeTextEncoder;
if (typeof (global as any).TextDecoder === 'undefined') (global as any).TextDecoder = NodeTextDecoder;

// In-memory AsyncStorage so salt + key-check persist across initialize() calls.
const store: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => (k in store ? store[k] : null)),
    setItem: jest.fn(async (k: string, v: string) => { store[k] = v; }),
    removeItem: jest.fn(async (k: string) => { delete store[k]; }),
  },
}));

// The expo-crypto jest mock (deterministic when crypto.subtle is removed) —
// used here ONLY to rebuild pre-hardening fixtures with the legacy algorithm.
import * as CryptoMock from '../../src/web/expo-crypto-mock';

import { EncryptionService } from '../../src/services/encryption';

const SALT_KEY = '@karuna/vault_salt';
const WRAPPED_DEK_KEY = '@karuna/vault_wrapped_dek';
const KEY_CHECK_KEY = '@karuna/vault_key_check';
const LEGACY_KDF_ITERATIONS = 1000;

function b64encode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function b64decode(s: string): Uint8Array {
  const binary = atob(s);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * v1 record header: magic 'KARV' (0x4B415256) + version byte 0x01.
 * The multi-byte header (not a single 0x01 marker) keeps legacy XOR records —
 * whose random 16-byte IV prefix could start with 0x01 — from being
 * misclassified as v1.
 */
function isV1RecordBytes(bytes: Uint8Array): boolean {
  return (
    // >= : an empty-plaintext record is exactly 33 bytes (header + iv + tag);
    // `>` would misroute it to the legacy path (mirrors src/services/encryption.ts).
    bytes.length >= 33 &&
    bytes[0] === 0x4b &&
    bytes[1] === 0x41 &&
    bytes[2] === 0x52 &&
    bytes[3] === 0x56 &&
    bytes[4] === 0x01
  );
}

/** Legacy (pre-hardening) PIN KDF: 1000x iterative SHA-256 via expo-crypto. */
async function legacyDeriveKey(pin: string, salt: string): Promise<Uint8Array> {
  let hash = `${salt}:${pin}:${salt}`;
  for (let i = 0; i < LEGACY_KDF_ITERATIONS; i++) {
    hash = await CryptoMock.digestStringAsync(
      CryptoMock.CryptoDigestAlgorithm.SHA256,
      hash + i.toString()
    );
  }
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(hash.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** Legacy (pre-hardening) record encryption: 16-byte IV + SHA-256 keystream XOR. */
async function legacyEncrypt(plaintext: string, keyBytes: Uint8Array): Promise<string> {
  const iv = new Uint8Array(16);
  for (let i = 0; i < 16; i++) iv[i] = (i * 37 + 11) & 0xff; // fixed fixture IV
  const keyString = b64encode(keyBytes);
  const ivHex = Array.from(iv).map((b) => b.toString(16).padStart(2, '0')).join('');
  const data = new NodeTextEncoder().encode(plaintext);
  const out = new Uint8Array(data.length);
  let keystream = new Uint8Array(0);
  let offset = 0;
  let counter = 0;
  for (let i = 0; i < data.length; i++) {
    if (offset >= keystream.length) {
      const hash = await CryptoMock.digestStringAsync(
        CryptoMock.CryptoDigestAlgorithm.SHA256,
        `${keyString}:${ivHex}:${counter}`
      );
      keystream = new Uint8Array(32);
      for (let j = 0; j < 32; j++) {
        keystream[j] = parseInt(hash.substring(j * 2, j * 2 + 2), 16);
      }
      offset = 0;
      counter++;
    }
    out[i] = data[i] ^ keystream[offset++];
  }
  const combined = new Uint8Array(16 + out.length);
  combined.set(iv);
  combined.set(out, 16);
  return b64encode(combined);
}

let savedSubtle: SubtleCrypto | undefined;

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  // Simulate Hermes/JSC: crypto exists (getRandomValues) but no subtle.
  savedSubtle = (global as any).crypto?.subtle;
  if ((global as any).crypto) {
    try { delete (global as any).crypto.subtle; } catch { (global as any).crypto.subtle = undefined; }
  }
});

afterEach(() => {
  if ((global as any).crypto && savedSubtle) {
    try { (global as any).crypto.subtle = savedSubtle; } catch {}
  }
});

describe('vault encryption without crypto.subtle (Hermes/JSC noble AES-GCM path)', () => {
  it('initializes a new vault successfully (no throw, returns true)', async () => {
    const svc = new EncryptionService();
    const ok = await svc.initialize('1234');
    expect(ok).toBe(true);
    expect(svc.isReady()).toBe(true);
  });

  it('round-trips encrypt → decrypt via AES-256-GCM (v1 versioned records)', async () => {
    const svc = new EncryptionService();
    await svc.initialize('1234');
    const enc = await svc.encrypt('bank account 12345678');
    expect(typeof enc).toBe('string');
    expect(enc).not.toContain('bank account'); // actually encrypted
    // v1 format header: magic 'KARV' + version byte 0x01
    expect(isV1RecordBytes(b64decode(enc))).toBe(true);
    const dec = await svc.decrypt(enc);
    expect(dec).toBe('bank account 12345678');
  });

  it('round-trips objects', async () => {
    const svc = new EncryptionService();
    await svc.initialize('1234');
    const enc = await svc.encryptObject({ name: 'Dr Smith', phone: '555-1' });
    expect(await svc.decryptObject(enc)).toEqual({ name: 'Dr Smith', phone: '555-1' });
  });

  it('round-trips an empty plaintext (exactly V1_OVERHEAD bytes routes to v1)', async () => {
    // Regression: isV1RecordBytes used `>` and misrouted empty-plaintext
    // records to the legacy path, where the misaligned IV fails the GCM tag.
    const svc = new EncryptionService();
    await svc.initialize('1234');
    const enc = await svc.encrypt('');
    expect(isV1RecordBytes(b64decode(enc))).toBe(true);
    expect(await svc.decrypt(enc)).toBe('');
  });

  it('unlocks with the correct PIN and rejects the wrong PIN (key-check)', async () => {
    // First session creates the vault + key-check.
    const a = new EncryptionService();
    expect(await a.initialize('1234')).toBe(true);

    // Correct PIN on a fresh instance unlocks.
    const b = new EncryptionService();
    expect(await b.initialize('1234')).toBe(true);

    // Wrong PIN is rejected.
    const c = new EncryptionService();
    expect(await c.initialize('9999')).toBe(false);
  });

  it('detects tampered records via the GCM auth tag', async () => {
    const svc = new EncryptionService();
    await svc.initialize('1234');
    const enc = await svc.encrypt('sensitive note');

    // Flip a bit in the auth tag (last byte).
    const tampered = b64decode(enc);
    tampered[tampered.length - 1] ^= 0x01;
    await expect(svc.decrypt(b64encode(tampered))).rejects.toThrow();

    // Flip a bit in the ciphertext body.
    const tampered2 = b64decode(enc);
    tampered2[20] ^= 0x01;
    await expect(svc.decrypt(b64encode(tampered2))).rejects.toThrow();

    // Untouched record still decrypts.
    expect(await svc.decrypt(enc)).toBe('sensitive note');
  });

  it('migrates a legacy XOR vault to AES-GCM on unlock (correct PIN)', async () => {
    // Build a pre-hardening vault: XOR records under the legacy KDF.
    const salt = 'legacy-salt-fixture';
    store[SALT_KEY] = salt;
    const oldPinKey = await legacyDeriveKey('1234', salt);
    const dek = new Uint8Array(32);
    for (let i = 0; i < 32; i++) dek[i] = (i * 13 + 5) & 0xff;
    store[WRAPPED_DEK_KEY] = await legacyEncrypt(b64encode(dek), oldPinKey);
    store[KEY_CHECK_KEY] = await legacyEncrypt('KARUNA_VAULT_KEY_VALID', dek);
    // Sanity: fixtures are unversioned (no v1 header).
    expect(isV1RecordBytes(b64decode(store[WRAPPED_DEK_KEY]))).toBe(false);

    const svc = new EncryptionService();
    expect(await svc.initialize('1234')).toBe(true);
    expect(svc.isReady()).toBe(true);

    // Records were transparently re-encrypted as v1.
    expect(isV1RecordBytes(b64decode(store[WRAPPED_DEK_KEY]))).toBe(true);
    expect(isV1RecordBytes(b64decode(store[KEY_CHECK_KEY]))).toBe(true);

    // The migrated DEK still protects data: round-trip works.
    const enc = await svc.encryptObject({ secret: 'still here' });
    expect(await svc.decryptObject(enc)).toEqual({ secret: 'still here' });

    // And the vault now unlocks via the hardened path (wrong PIN rejected).
    const svc2 = new EncryptionService();
    expect(await svc2.initialize('1234')).toBe(true);
    const svc3 = new EncryptionService();
    expect(await svc3.initialize('9999')).toBe(false);
  });

  it('rejects the wrong PIN on a legacy vault (no migration without verification)', async () => {
    const salt = 'legacy-salt-fixture-2';
    store[SALT_KEY] = salt;
    const oldPinKey = await legacyDeriveKey('1234', salt);
    const dek = new Uint8Array(32).fill(9);
    store[WRAPPED_DEK_KEY] = await legacyEncrypt(b64encode(dek), oldPinKey);
    store[KEY_CHECK_KEY] = await legacyEncrypt('KARUNA_VAULT_KEY_VALID', dek);

    const svc = new EncryptionService();
    expect(await svc.initialize('0000')).toBe(false);
    expect(svc.isReady()).toBe(false);
    // Nothing was migrated: records are still unversioned.
    expect(isV1RecordBytes(b64decode(store[WRAPPED_DEK_KEY]))).toBe(false);
  });
});
