/**
 * Regression tests for the Knowledge Vault encryption when the Web Crypto API
 * (crypto.subtle) is unavailable — i.e. on Hermes (Android) and JSC (iOS),
 * which is EVERY real device. Before the fix, initialize() threw
 * "Web Crypto API not available" and createVault returned false ("Failed to
 * create vault"). These tests force the no-crypto.subtle path and require the
 * vault to initialize and round-trip data via the expo-crypto fallback.
 */

// jsdom in this jest setup doesn't expose TextEncoder/TextDecoder as globals;
// React Native / Expo provide them on-device (encryptedDatabase.ts already
// relies on them). Polyfill from Node's util so the fallback path can run here.
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

import { EncryptionService } from '../../src/services/encryption';

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

describe('vault encryption without crypto.subtle (Hermes/JSC fallback)', () => {
  it('initializes a new vault successfully (no throw, returns true)', async () => {
    const svc = new EncryptionService();
    const ok = await svc.initialize('1234');
    expect(ok).toBe(true);
    expect(svc.isReady()).toBe(true);
  });

  it('round-trips encrypt → decrypt via the fallback', async () => {
    const svc = new EncryptionService();
    await svc.initialize('1234');
    const enc = await svc.encrypt('bank account 12345678');
    expect(typeof enc).toBe('string');
    expect(enc).not.toContain('bank account'); // actually encrypted
    const dec = await svc.decrypt(enc);
    expect(dec).toBe('bank account 12345678');
  });

  it('round-trips objects', async () => {
    const svc = new EncryptionService();
    await svc.initialize('1234');
    const enc = await svc.encryptObject({ name: 'Dr Smith', phone: '555-1' });
    expect(await svc.decryptObject(enc)).toEqual({ name: 'Dr Smith', phone: '555-1' });
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
});
