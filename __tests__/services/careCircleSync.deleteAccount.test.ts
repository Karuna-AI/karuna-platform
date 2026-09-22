/**
 * Tests for in-app account deletion (App Store 5.1.1(v)).
 *
 * Covers CareCircleSyncService.deleteAccount() against the server contract
 * POST /api/care/auth/delete-account:
 *   - 200 → success
 *   - 409 with ownedCircles → second-confirmation payload surfaced
 *   - 400/403 → server error message surfaced
 *   - 429 → rate-limit message
 *   - network failure → friendly error
 *   - no auth token → blocked before any network call
 * And clearLocalSession(): wipes the dead auth token (SecureStore) plus the
 * circle keys in AsyncStorage, and notifies listeners with 'account_deleted'.
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
const deletedSecureKeys: string[] = [];
jest.mock('../../src/services/secureStorage', () => ({
  secureStorageService: {
    storeCaregiverToken: jest.fn(async () => ({ success: true })),
    getCaregiverToken: jest.fn(async () => ({ success: true })),
    deleteItem: jest.fn(async (key: string) => {
      deletedSecureKeys.push(key);
      return { success: true };
    }),
  },
}));

// vaultService is only touched by applyRemoteData on pull; stub every method.
jest.mock('../../src/services/vault', () => ({
  vaultService: new Proxy({}, { get: () => jest.fn(async () => ({})) }),
}));

import { CareCircleSyncService } from '../../src/services/careCircleSync';
import { secureStorageService } from '../../src/services/secureStorage';

const URL_BASE = 'http://localhost:3021';
const DELETE_URL = `${URL_BASE}/api/care/auth/delete-account`;

function freshService(): CareCircleSyncService {
  // The exported singleton is fine, but a fresh instance keeps tests isolated.
  return new CareCircleSyncService();
}

async function authedService(): Promise<CareCircleSyncService> {
  const svc = freshService();
  await svc.initialize(URL_BASE);
  await svc.setAuthToken('test-token-123');
  return svc;
}

function mockDeleteResponse(status: number, body: unknown) {
  (global as any).fetch = jest.fn(async (url: string, init?: RequestInit) => {
    expect(String(url)).toBe(DELETE_URL);
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>)?.Authorization).toBe('Bearer test-token-123');
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  });
}

beforeEach(() => {
  for (const k of Object.keys(asyncStore)) delete asyncStore[k];
  deletedSecureKeys.length = 0;
  (global as any).fetch = jest.fn(async () => ({ ok: true, json: async () => ({}) }));
  jest.clearAllMocks();
});

describe('deleteAccount', () => {
  it('returns success on 200', async () => {
    const svc = await authedService();
    mockDeleteResponse(200, { success: true, message: 'Your account and data have been deleted.' });

    const result = await svc.deleteAccount('correct-password');

    expect(result).toEqual({ success: true });
  });

  it('passes confirmDeleteOwnedCircles=true through on the second attempt', async () => {
    const svc = await authedService();
    const bodies: unknown[] = [];
    (global as any).fetch = jest.fn(async (_url: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      return { ok: true, status: 200, json: async () => ({ success: true }) };
    });

    await svc.deleteAccount('pw', true);

    expect(bodies).toEqual([{ password: 'pw', confirmDeleteOwnedCircles: true }]);
  });

  it('surfaces ownedCircles on 409 so the UI can ask for a second confirmation', async () => {
    const svc = await authedService();
    const ownedCircles = [{ id: 'c1', name: 'Family', memberCount: 3 }];
    mockDeleteResponse(409, {
      error: 'You own care circles. Deleting your account permanently deletes them for all members.',
      ownedCircles,
      confirmationRequired: 'confirmDeleteOwnedCircles',
    });

    const result = await svc.deleteAccount('pw');

    expect(result.success).toBe(false);
    expect(result.ownedCircles).toEqual(ownedCircles);
    expect(result.error).toContain('own care circles');
  });

  it('surfaces the server error on 403 (incorrect password)', async () => {
    const svc = await authedService();
    mockDeleteResponse(403, { error: 'Incorrect password' });

    const result = await svc.deleteAccount('wrong-password');

    expect(result).toEqual({ success: false, error: 'Incorrect password' });
  });

  it('returns a rate-limit message on 429', async () => {
    const svc = await authedService();
    mockDeleteResponse(429, { error: 'Too many requests' });

    const result = await svc.deleteAccount('pw');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Too many attempts');
  });

  it('returns a network error when fetch throws', async () => {
    const svc = await authedService();
    (global as any).fetch = jest.fn(async () => { throw new Error('boom'); });

    const result = await svc.deleteAccount('pw');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Network error');
  });

  it('blocks when there is no auth token (no network call)', async () => {
    const svc = freshService();
    await svc.initialize(URL_BASE);
    const fetchSpy = (global as any).fetch;

    const result = await svc.deleteAccount('pw');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Not signed in');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('clearLocalSession', () => {
  it('wipes the dead token and circle keys, then notifies listeners', async () => {
    const svc = await authedService();
    const events: string[] = [];
    svc.addSyncListener((event) => events.push(event));

    await svc.clearLocalSession();

    expect(svc.getAuthToken()).toBeNull();
    expect(svc.isConnected()).toBe(false);
    expect(secureStorageService.deleteItem).toHaveBeenCalledWith('caregiver_auth_token');
    const multiRemove = jest.requireMock('@react-native-async-storage/async-storage').default.multiRemove;
    const removedKeys: string[] = multiRemove.mock.calls[0]?.[0] ?? [];
    expect(removedKeys).toEqual(
      expect.arrayContaining([
        '@karuna_care_circle_id',
        '@karuna_pending_changes',
        '@karuna_last_sync',
        '@karuna_circle_role',
        '@karuna_care_auth_token',
      ])
    );
    expect(events).toContain('account_deleted');
  });
});
