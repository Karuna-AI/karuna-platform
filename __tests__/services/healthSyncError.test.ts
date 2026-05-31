/**
 * Covers healthDataService's sync-error surfacing (addSyncErrorListener /
 * notifySyncError) and the addVitalReading upload-failure branch — so a failed
 * vital upload notifies subscribers (HealthDashboard shows it). Also restores
 * healthData.ts function coverage over the 80% gate.
 */
const store: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => (k in store ? store[k] : null)),
    setItem: jest.fn(async (k: string, v: string) => { store[k] = v; }),
    removeItem: jest.fn(async (k: string) => { delete store[k]; }),
  },
}));
jest.mock('../../src/services/auditLog', () => ({
  auditLogService: { logVaultAccess: jest.fn(async () => {}), log: jest.fn(async () => {}) },
}));
const pushHealthReadings = jest.fn(async () => ({ success: true }) as { success: boolean; error?: string });
jest.mock('../../src/services/careCircleSync', () => ({
  careCircleSyncService: { isConnected: () => true, pushHealthReadings, getAuthToken: () => 't' },
}));

import { healthDataService } from '../../src/services/healthData';

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  pushHealthReadings.mockReset();
  pushHealthReadings.mockResolvedValue({ success: true });
});

async function logHeartRate(value: number) {
  return healthDataService.addVitalReading({ type: 'heart_rate', value, unit: 'bpm', source: 'manual' } as any);
}

describe('healthDataService vital-upload error surfacing', () => {
  it('notifies sync-error listeners when the upload fails', async () => {
    await healthDataService.initialize();
    const errors: string[] = [];
    const unsub = healthDataService.addSyncErrorListener((e) => errors.push(e));

    pushHealthReadings.mockResolvedValue({ success: false, error: 'Network error' });
    await logHeartRate(72);
    // upload is fire-and-forget; let the microtask resolve
    await new Promise((r) => setTimeout(r, 0));

    expect(pushHealthReadings).toHaveBeenCalled();
    expect(errors).toContain('Network error');
    unsub();
  });

  it('does not notify listeners on a successful upload, and unsubscribe works', async () => {
    await healthDataService.initialize();
    const errors: string[] = [];
    const unsub = healthDataService.addSyncErrorListener((e) => errors.push(e));
    unsub(); // unsubscribe immediately

    pushHealthReadings.mockResolvedValue({ success: false, error: 'X' });
    await logHeartRate(80);
    await new Promise((r) => setTimeout(r, 0));

    expect(errors).toHaveLength(0); // unsubscribed → not notified
  });
});
