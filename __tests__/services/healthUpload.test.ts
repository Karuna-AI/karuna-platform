/**
 * Fix A — health vitals now flow from the device to the care circle.
 * Covers the VitalReading→server mapping and CareCircleSyncService.pushHealthReadings.
 */
import { TextEncoder as NodeTextEncoder, TextDecoder as NodeTextDecoder } from 'util';
if (typeof (global as any).TextEncoder === 'undefined') (global as any).TextEncoder = NodeTextEncoder;
if (typeof (global as any).TextDecoder === 'undefined') (global as any).TextDecoder = NodeTextDecoder;

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
const secureStore: { token?: string } = {};
jest.mock('../../src/services/secureStorage', () => ({
  secureStorageService: {
    storeCaregiverToken: jest.fn(async (t: string) => { secureStore.token = t; return { success: true }; }),
    getCaregiverToken: jest.fn(async () => ({ success: true, token: secureStore.token })),
  },
}));
jest.mock('../../src/services/vault', () => ({
  vaultService: new Proxy({}, { get: () => jest.fn(async () => ({})) }),
}));

import { CareCircleSyncService } from '../../src/services/careCircleSync';
import { vitalReadingToServerReading } from '../../src/services/healthData';

beforeEach(() => {
  for (const k of Object.keys(asyncStore)) delete asyncStore[k];
  delete secureStore.token;
});

describe('vitalReadingToServerReading mapping', () => {
  const base = { id: 'v1', timestamp: '2026-05-31T10:00:00Z', unit: 'bpm', source: 'manual' as const };

  it('maps a scalar vital straight through', () => {
    const out = vitalReadingToServerReading({ ...base, type: 'heart_rate', value: 72 } as any);
    expect(out).toEqual({ dataType: 'heart_rate', value: 72, unit: 'bpm', measuredAt: '2026-05-31T10:00:00Z', source: 'manual', notes: undefined });
  });

  it('maps blood_pressure to a {systolic,diastolic} object', () => {
    const out = vitalReadingToServerReading({ ...base, type: 'blood_pressure', value: 120, secondaryValue: 80, unit: 'mmHg' } as any);
    expect(out?.value).toEqual({ systolic: 120, diastolic: 80 });
    expect(out?.dataType).toBe('blood_pressure');
  });

  it('returns null for types the server does not accept (sleep)', () => {
    expect(vitalReadingToServerReading({ ...base, type: 'sleep', value: 8 } as any)).toBeNull();
  });
});

describe('CareCircleSyncService.pushHealthReadings', () => {
  async function connected() {
    asyncStore['@karuna_care_circle_id'] = 'circle-1';
    secureStore.token = 'tok-h';
    const svc = new CareCircleSyncService();
    await svc.initialize('http://localhost:3021');
    return svc;
  }

  it('POSTs readings to /health with the Bearer token', async () => {
    const svc = await connected();
    let captured: any = null;
    (global as any).fetch = jest.fn(async (url: string, opts: any) => {
      captured = { url, opts };
      return { ok: true, json: async () => ({ success: true, inserted: 1 }) };
    });
    const r = await svc.pushHealthReadings([{ dataType: 'heart_rate', value: 72, unit: 'bpm', measuredAt: '2026-05-31T10:00:00Z', source: 'manual' }]);
    expect(r.success).toBe(true);
    expect(r.inserted).toBe(1);
    expect(captured.url).toContain('/api/care/circles/circle-1/health');
    expect(captured.opts.headers.Authorization).toBe('Bearer tok-h');
    expect(JSON.parse(captured.opts.body).readings).toHaveLength(1);
  });

  it('fails cleanly when not connected (no token/circle)', async () => {
    const svc = new CareCircleSyncService();
    await svc.initialize('http://localhost:3021');
    const r = await svc.pushHealthReadings([{ dataType: 'heart_rate', value: 72, measuredAt: 'now' }]);
    expect(r.success).toBe(false);
    expect(r.error).toBe('Not connected to care circle');
  });
});

describe('CareCircleSyncService.pushConsent', () => {
  it('PUTs the consent object to /consent with the Bearer token', async () => {
    asyncStore['@karuna_care_circle_id'] = 'circle-1';
    secureStore.token = 'tok-c';
    const svc = new CareCircleSyncService();
    await svc.initialize('http://localhost:3021');
    let captured: any = null;
    (global as any).fetch = jest.fn(async (url: string, opts: any) => {
      captured = { url, opts };
      return { ok: true, json: async () => ({ success: true }) };
    });
    const r = await svc.pushConsent({ globalDataSharing: true, consents: [{ category: 'health_data', grantee: 'caregiver_member', accessLevel: 'read' }] });
    expect(r.success).toBe(true);
    expect(captured.opts.method).toBe('PUT');
    expect(captured.url).toContain('/api/care/circles/circle-1/consent');
    expect(captured.opts.headers.Authorization).toBe('Bearer tok-c');
    expect(JSON.parse(captured.opts.body).consent.globalDataSharing).toBe(true);
  });

  it('fails cleanly when not connected', async () => {
    const svc = new CareCircleSyncService();
    await svc.initialize('http://localhost:3021');
    const r = await svc.pushConsent({ globalDataSharing: false, consents: [] });
    expect(r.success).toBe(false);
    expect(r.error).toBe('Not connected to care circle');
  });
});
