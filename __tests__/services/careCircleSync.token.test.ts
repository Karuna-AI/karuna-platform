/**
 * Regression tests for the care-circle auth-token persistence bug.
 *
 * Root cause (observed on a real Android build): joinCircle() persisted the
 * auth token to AsyncStorage while initialize() read it back from SecureStore,
 * so after an app restart the token was lost, this.authToken stayed null, and
 * every sync failed with the generic "Unable to sync". These tests pin the
 * write/read store to SecureStore, add a one-time migration of the legacy
 * AsyncStorage token, and require sync() to surface the real error string.
 */

// In-memory AsyncStorage
const asyncStore: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => (k in asyncStore ? asyncStore[k] : null)),
    setItem: jest.fn(async (k: string, v: string) => { asyncStore[k] = v; }),
    removeItem: jest.fn(async (k: string) => { delete asyncStore[k]; }),
    multiRemove: jest.fn(async (ks: string[]) => { ks.forEach((k) => delete asyncStore[k]); }),
  },
}));

// In-memory SecureStore
const secureStore: { token?: string } = {};
jest.mock('../../src/services/secureStorage', () => ({
  secureStorageService: {
    storeCaregiverToken: jest.fn(async (t: string) => { secureStore.token = t; return { success: true }; }),
    getCaregiverToken: jest.fn(async () => ({ success: true, token: secureStore.token })),
  },
}));

// vaultService is only touched by applyRemoteData on pull; stub every method.
jest.mock('../../src/services/vault', () => ({
  vaultService: new Proxy({}, { get: () => jest.fn(async () => ({})) }),
}));

import { CareCircleSyncService } from '../../src/services/careCircleSync';
import { secureStorageService } from '../../src/services/secureStorage';

const URL_BASE = 'http://localhost:3021';
const LEGACY_ASYNC_KEY = '@karuna_care_auth_token';
const CIRCLE_KEY = '@karuna_care_circle_id';

function mockAcceptResponse(token: string, circleId = 'circle-1') {
  (global as any).fetch = jest.fn(async (url: string) => {
    if (String(url).includes('/invitations/')) {
      return { ok: true, json: async () => ({ success: true, token, circle: { id: circleId, name: 'Test Circle' } }) };
    }
    // sync GET/POST
    return { ok: true, json: async () => ({ medications: [], doctors: [], appointments: [], contacts: [], notes: [], accounts: [] }) };
  });
}

beforeEach(() => {
  for (const k of Object.keys(asyncStore)) delete asyncStore[k];
  delete secureStore.token;
  (global as any).fetch = jest.fn(async () => ({ ok: true, json: async () => ({}) }));
});

describe('care-circle auth token persistence', () => {
  it('joinCircle persists the auth token to SecureStore (not only AsyncStorage)', async () => {
    mockAcceptResponse('tok-abc');
    const svc = new CareCircleSyncService();
    await svc.initialize(URL_BASE);

    const res = await svc.joinCircle('invite-123');
    expect(res.success).toBe(true);
    expect(secureStorageService.storeCaregiverToken).toHaveBeenCalledWith('tok-abc');
  });

  it('recovers the token after an app restart (write store === read store)', async () => {
    mockAcceptResponse('tok-restart');
    const first = new CareCircleSyncService();
    await first.initialize(URL_BASE);
    await first.joinCircle('invite-123');

    // Simulate a fresh process: a brand-new instance reading persisted storage.
    const second = new CareCircleSyncService();
    await second.initialize(URL_BASE);

    const calls: string[] = [];
    (global as any).fetch = jest.fn(async (url: string, opts: any) => {
      calls.push(opts?.headers?.Authorization ?? '');
      return { ok: true, json: async () => ({ medications: [], doctors: [], appointments: [], contacts: [], notes: [], accounts: [] }) };
    });
    const pull = await second.pullFromCloud();

    expect(pull.success).toBe(true);
    expect(calls.some((h) => h === 'Bearer tok-restart')).toBe(true);
  });

  it('migrates a legacy AsyncStorage token to SecureStore on initialize', async () => {
    // Device upgraded from an old build: token sits in the legacy AsyncStorage key.
    asyncStore[LEGACY_ASYNC_KEY] = 'tok-legacy';
    asyncStore[CIRCLE_KEY] = 'circle-1';

    const svc = new CareCircleSyncService();
    await svc.initialize(URL_BASE);

    // Adopted into SecureStore and the legacy key cleared.
    expect(secureStorageService.storeCaregiverToken).toHaveBeenCalledWith('tok-legacy');
    expect(asyncStore[LEGACY_ASYNC_KEY]).toBeUndefined();

    const calls: string[] = [];
    (global as any).fetch = jest.fn(async (url: string, opts: any) => {
      calls.push(opts?.headers?.Authorization ?? '');
      return { ok: true, json: async () => ({ medications: [], doctors: [], appointments: [], contacts: [], notes: [], accounts: [] }) };
    });
    await svc.pullFromCloud();
    expect(calls.some((h) => h === 'Bearer tok-legacy')).toBe(true);
  });

  it('sync() surfaces the real error instead of dropping it', async () => {
    // No token, but a circle id is set → pullFromCloud returns a specific reason.
    asyncStore[CIRCLE_KEY] = 'circle-1';
    const svc = new CareCircleSyncService();
    await svc.initialize(URL_BASE);

    const result = await svc.sync();
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).toBe('Not connected to care circle');
  });
});

describe('getMyCircleRole (M1/M2 — role from circle membership, not onboarding)', () => {
  async function joinedService(role: string) {
    mockAcceptResponse('tok-role', 'circle-1');
    const svc = new CareCircleSyncService();
    await svc.initialize(URL_BASE);
    await svc.joinCircle('invite-1');
    // From here, /auth/me returns this user's circles with their role.
    (global as any).fetch = jest.fn(async (url: string) => {
      if (String(url).includes('/auth/me')) {
        return { ok: true, json: async () => ({ user: { id: 'u1' }, circles: [{ id: 'circle-1', role }] }) };
      }
      return { ok: true, json: async () => ({}) };
    });
    return svc;
  }

  it('returns null when not connected to a circle', async () => {
    const svc = new CareCircleSyncService();
    await svc.initialize(URL_BASE);
    expect(await svc.getMyCircleRole()).toBeNull();
  });

  it('returns the role for the current circle from /auth/me and caches it', async () => {
    const svc = await joinedService('caregiver');
    expect(await svc.getMyCircleRole()).toBe('caregiver');
    expect(asyncStore['@karuna_circle_role']).toBe('caregiver');
  });

  it('distinguishes owner from caregiver', async () => {
    const svc = await joinedService('owner');
    expect(await svc.getMyCircleRole()).toBe('owner');
  });

  it('falls back to the cached role when /auth/me fails (offline)', async () => {
    const svc = await joinedService('caregiver');
    await svc.getMyCircleRole(); // populate cache
    (global as any).fetch = jest.fn(async () => { throw new Error('offline'); });
    expect(await svc.getMyCircleRole()).toBe('caregiver');
  });
});
