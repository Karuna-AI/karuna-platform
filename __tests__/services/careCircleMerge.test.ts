/**
 * Care-circle merge behavior (end-to-end through pullFromCloud).
 *
 * Pins last-write-wins against the server's snake_case timestamps:
 *  - a newer remote row UPDATEs the local copy (snake_case updated_at wins)
 *  - an older remote row is SKIPPED (local is newer)
 *  - an unknown remote id is ADDed (server id dropped, timestamps preserved)
 *  - nothing merges while the vault is locked
 */
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

jest.mock('../../src/services/secureStorage', () => ({
  secureStorageService: {
    storeCaregiverToken: jest.fn(async () => ({ success: true })),
    getCaregiverToken: jest.fn(async () => ({ success: true, token: undefined })),
  },
}));

const vaultMock = {
  isUnlocked: jest.fn(() => true),
  setChangeListener: jest.fn(),
  getMedications: jest.fn(async () => [] as any[]),
  addMedication: jest.fn(async () => ({ id: 'local-new' })),
  updateMedication: jest.fn(async () => ({})),
  getDoctors: jest.fn(async () => []),
  getAppointments: jest.fn(async () => []),
  getContacts: jest.fn(async () => []),
  getNotes: jest.fn(async () => []),
};
jest.mock('../../src/services/vault', () => ({
  vaultService: vaultMock,
}));

import { CareCircleSyncService } from '../../src/services/careCircleSync';

const URL_BASE = 'http://localhost:3021';

const LOCAL_MEDS = [
  { id: 'm1', name: 'Local Aspirin', updatedAt: '2026-05-30T10:00:00Z' },
  { id: 'm2', name: 'Local Newer', updatedAt: '2026-06-02T10:00:00Z' },
];

function mockJoin() {
  (global as any).fetch = jest.fn(async (url: string) => {
    if (String(url).includes('/invitations/')) {
      return { ok: true, json: async () => ({ success: true, token: 'tok', circle: { id: 'circle-1', name: 'C' } }) };
    }
    return { ok: true, json: async () => ({}) };
  });
}

function mockSyncPayload(payload: unknown) {
  (global as any).fetch = jest.fn(async () => ({
    ok: true,
    json: async () => payload,
  }));
}

async function connectedService() {
  mockJoin();
  const svc = new CareCircleSyncService();
  await svc.initialize(URL_BASE);
  await svc.joinCircle('invite-123');
  return svc;
}

beforeEach(() => {
  for (const k of Object.keys(asyncStore)) delete asyncStore[k];
  jest.clearAllMocks();
  vaultMock.isUnlocked.mockReturnValue(true);
  vaultMock.getMedications.mockResolvedValue(LOCAL_MEDS);
});

describe('care-circle pull merge behavior', () => {
  it('UPDATEs local when the remote snake_case row is newer', async () => {
    const svc = await connectedService();
    mockSyncPayload({
      medications: [{ id: 'm1', name: 'Remote Aspirin', updated_at: '2026-05-31T10:00:00Z' }],
    });

    const res = await svc.pullFromCloud();
    expect(res.success).toBe(true);
    expect(vaultMock.updateMedication).toHaveBeenCalledTimes(1);
    const updateCalls = vaultMock.updateMedication.mock.calls as unknown as [string, Record<string, unknown>][];
    const [id, updates] = updateCalls[0]!;
    expect(id).toBe('m1');
    expect(updates.name).toBe('Remote Aspirin');
    // server timestamp normalized so subsequent merges compare correctly
    expect(updates.updated_at).toBe('2026-05-31T10:00:00Z');
    expect(updates.updatedAt).toBe('2026-05-31T10:00:00Z');
  });

  it('SKIPs the remote row when local is newer', async () => {
    const svc = await connectedService();
    mockSyncPayload({
      medications: [{ id: 'm2', name: 'Remote Older', updated_at: '2026-06-01T10:00:00Z' }],
    });

    await svc.pullFromCloud();
    expect(vaultMock.updateMedication).not.toHaveBeenCalled();
    expect(vaultMock.addMedication).not.toHaveBeenCalled();
  });

  it('ADDs unknown remote ids, dropping the server id but keeping timestamps', async () => {
    const svc = await connectedService();
    mockSyncPayload({
      medications: [{ id: 'm3', name: 'Brand New', updated_at: '2026-06-01T10:00:00Z' }],
    });

    await svc.pullFromCloud();
    expect(vaultMock.addMedication).toHaveBeenCalledTimes(1);
    const addCalls = vaultMock.addMedication.mock.calls as unknown as [Record<string, unknown>][];
    const added = addCalls[0]![0];
    expect(added.name).toBe('Brand New');
    expect(added.id).toBeUndefined(); // vault mints the local id
    expect(added.updated_at).toBe('2026-06-01T10:00:00Z');
    expect(added.updatedAt).toBe('2026-06-01T10:00:00Z');
  });

  it('merges nothing while the vault is locked', async () => {
    vaultMock.isUnlocked.mockReturnValue(false);
    const svc = await connectedService();
    mockSyncPayload({
      medications: [{ id: 'm9', name: 'Should Not Merge', updated_at: '2026-06-01T10:00:00Z' }],
    });

    const res = await svc.pullFromCloud();
    expect(res.success).toBe(true);
    expect(vaultMock.addMedication).not.toHaveBeenCalled();
    expect(vaultMock.updateMedication).not.toHaveBeenCalled();
  });

  it('returns "Not connected to care circle" without credentials', async () => {
    const svc = new CareCircleSyncService();
    await svc.initialize(URL_BASE);
    const res = await svc.pullFromCloud();
    expect(res.success).toBe(false);
    expect(res.error).toBe('Not connected to care circle');
  });
});
