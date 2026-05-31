/**
 * Fix B — granting/revoking consent now syncs the patient's preferences up to
 * the care circle (previously consent.ts only persisted to AsyncStorage and the
 * server's enforcement always ran against an empty {}).
 */
const asyncStore: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => (k in asyncStore ? asyncStore[k] : null)),
    setItem: jest.fn(async (k: string, v: string) => { asyncStore[k] = v; }),
    removeItem: jest.fn(async (k: string) => { delete asyncStore[k]; }),
  },
}));
jest.mock('../../src/services/auditLog', () => ({
  auditLogService: { logConsentChange: jest.fn(async () => {}), log: jest.fn(async () => {}) },
}));
const pushConsent = jest.fn(async () => ({ success: true }));
jest.mock('../../src/services/careCircleSync', () => ({
  careCircleSyncService: { isConnected: () => true, pushConsent },
}));

import { consentService } from '../../src/services/consent';

beforeEach(() => {
  for (const k of Object.keys(asyncStore)) delete asyncStore[k];
  pushConsent.mockClear();
});

describe('consent → server sync', () => {
  it('pushes consent to the circle when the patient grants a caregiver category', async () => {
    await consentService.initialize('patient-1');
    await consentService.setGlobalDataSharing(true);
    pushConsent.mockClear();

    const res = await consentService.grantConsent('health_data' as any, 'caregiver_member' as any, 'read' as any);
    expect(res.success).toBe(true);

    expect(pushConsent).toHaveBeenCalled();
    const arg = pushConsent.mock.calls[pushConsent.mock.calls.length - 1][0] as any;
    expect(arg.globalDataSharing).toBe(true);
    expect(arg.consents.some((c: any) => c.category === 'health_data' && c.grantee === 'caregiver_member' && !c.revokedAt)).toBe(true);
  });
});
