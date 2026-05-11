/**
 * Health Data Service Tests
 *
 * Comprehensive tests for HealthDataService: addVitalReading, getVitalsByType,
 * getLatestVital, getVitalSummary (with trend), steps goal, deleteVitalReading,
 * clearAllVitals, storage persistence, sync-status helpers, and requestPermissions.
 *
 * Replaces the earlier placeholder tests that only exercised plain objects.
 */

// ─── module mocks ─────────────────────────────────────────────────────────────

const _store: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn((key: string) => Promise.resolve(_store[key] ?? null)),
    setItem: jest.fn((key: string, value: string) => { _store[key] = value; return Promise.resolve(); }),
    removeItem: jest.fn((key: string) => { delete _store[key]; return Promise.resolve(); }),
    clear: jest.fn(() => { Object.keys(_store).forEach(k => delete _store[k]); return Promise.resolve(); }),
  },
}));

jest.mock('expo-sensors', () => ({
  Pedometer: {
    isAvailableAsync: jest.fn().mockResolvedValue(false),
    getStepCountAsync: jest.fn().mockResolvedValue({ steps: 0 }),
  },
}));

jest.mock('../../src/services/auditLog', () => ({
  auditLogService: {
    log: jest.fn().mockResolvedValue(undefined),
    logVaultAccess: jest.fn().mockResolvedValue(undefined),
  },
}));

// Default: consent granted; override per test with mockReturnValueOnce(false)
jest.mock('../../src/services/consent', () => ({
  consentService: {
    hasConsent: jest.fn().mockReturnValue(true),
  },
}));

// healthAdapter: not available (triggers manual-entry / grant-all path)
jest.mock('../../src/services/healthAdapter', () => ({
  healthAdapter: {
    isAvailable: jest.fn().mockResolvedValue(false),
    requestPermissions: jest.fn().mockResolvedValue({ granted: [], denied: [] }),
    getHeartRate: jest.fn().mockResolvedValue(null),
    getBloodPressure: jest.fn().mockResolvedValue(null),
    getBloodGlucose: jest.fn().mockResolvedValue(null),
    getWeight: jest.fn().mockResolvedValue(null),
    getOxygenSaturation: jest.fn().mockResolvedValue(null),
  },
}));

// ─── imports ──────────────────────────────────────────────────────────────────

import AsyncStorage from '@react-native-async-storage/async-storage';
import { healthDataService as svc } from '../../src/services/healthData';

// ─── helpers ──────────────────────────────────────────────────────────────────

function clearStore() {
  Object.keys(_store).forEach(k => delete _store[k]);
}

function resetService() {
  const s = svc as any;
  s.vitals = [];
  s.stepsGoal = 7000;
  s.isInitialized = false;
  s.syncStatus = {
    isConnected: false,
    platform: 'none',
    permissionsGranted: [],
    permissionsDenied: [],
  };
}

function makeReading(type: string, value: number, extras: Record<string, any> = {}) {
  return { type: type as any, value, unit: 'unit', source: 'manual' as const, ...extras };
}

/** Directly inject a VitalReading with a controlled timestamp (bypasses service timestamp). */
function injectReading(type: string, value: number, timestamp: string, extras: Record<string, any> = {}) {
  (svc as any).vitals.push({
    id: `vital_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    type,
    value,
    unit: 'unit',
    timestamp,
    source: 'manual',
    ...extras,
  });
}

// ─── initialization ───────────────────────────────────────────────────────────

describe('HealthDataService – initialization', () => {
  beforeEach(() => {
    clearStore();
    resetService();
    jest.clearAllMocks();
  });

  it('loads stored vitals from AsyncStorage on initialize()', async () => {
    const stored = [
      { id: 'v1', type: 'heart_rate', value: 72, unit: 'bpm', timestamp: new Date().toISOString(), source: 'manual' },
    ];
    _store['@karuna_health_vitals'] = JSON.stringify(stored);

    await svc.initialize();

    expect(svc.getVitalsByType('heart_rate')).toHaveLength(1);
    expect(svc.getVitalsByType('heart_rate')[0].value).toBe(72);
  });

  it('loads the steps goal from AsyncStorage', async () => {
    _store['@karuna_steps_goal'] = '10000';

    await svc.initialize();

    expect(svc.getStepsComparison().goal).toBe(10000);
  });

  it('does not re-initialize if already initialized', async () => {
    (svc as any).isInitialized = true;
    const spy = jest.spyOn(AsyncStorage, 'getItem');

    await svc.initialize();

    expect(spy).not.toHaveBeenCalled();
  });

  it('does NOT set isInitialized=true when storage throws (allows retry)', async () => {
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error('disk fail'));

    await svc.initialize();

    // By design the service leaves isInitialized false on error so the caller can retry
    expect((svc as any).isInitialized).toBe(false);
  });
});

// ─── addVitalReading ──────────────────────────────────────────────────────────

describe('HealthDataService – addVitalReading', () => {
  beforeEach(() => {
    clearStore();
    resetService();
    jest.clearAllMocks();
    (svc as any).isInitialized = true;
  });

  it('returns a reading with generated id and current timestamp', async () => {
    const reading = await svc.addVitalReading(makeReading('heart_rate', 75, { unit: 'bpm' }));

    expect(reading.id).toMatch(/^vital_/);
    expect(reading.timestamp).toBeTruthy();
    expect(reading.type).toBe('heart_rate');
    expect(reading.value).toBe(75);
  });

  it('persists reading to AsyncStorage', async () => {
    await svc.addVitalReading(makeReading('blood_glucose', 90, { unit: 'mg/dL' }));

    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      '@karuna_health_vitals',
      expect.stringContaining('blood_glucose')
    );
  });

  it('prepends so the latest reading is at index 0', async () => {
    await svc.addVitalReading(makeReading('weight', 70, { unit: 'kg' }));
    await svc.addVitalReading(makeReading('weight', 71, { unit: 'kg' }));

    const vitals = svc.getVitalsByType('weight');
    expect(vitals[0].value).toBe(71);
    expect(vitals[1].value).toBe(70);
  });

  it('logs a vault audit entry', async () => {
    const { auditLogService } = require('../../src/services/auditLog');
    await svc.addVitalReading(makeReading('temperature', 98.6, { unit: '°F' }));

    expect(auditLogService.logVaultAccess).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'created', entityType: 'vital_reading' })
    );
  });

  it('supports blood_pressure with secondaryValue (diastolic)', async () => {
    const reading = await svc.addVitalReading({
      type: 'blood_pressure',
      value: 120,
      secondaryValue: 80,
      unit: 'mmHg',
      source: 'manual',
    });

    expect(reading.value).toBe(120);
    expect(reading.secondaryValue).toBe(80);
  });
});

// ─── getVitalsByType / getLatestVital ─────────────────────────────────────────

describe('HealthDataService – read helpers', () => {
  beforeEach(async () => {
    clearStore();
    resetService();
    jest.clearAllMocks();
    (svc as any).isInitialized = true;

    await svc.addVitalReading(makeReading('heart_rate', 65, { unit: 'bpm' }));
    await svc.addVitalReading(makeReading('heart_rate', 72, { unit: 'bpm' }));
    await svc.addVitalReading(makeReading('weight', 68, { unit: 'kg' }));
  });

  it('getVitalsByType returns only readings of the requested type', () => {
    const hr = svc.getVitalsByType('heart_rate');
    expect(hr).toHaveLength(2);
    hr.forEach(r => expect(r.type).toBe('heart_rate'));
  });

  it('getVitalsByType with limit returns at most N readings', () => {
    expect(svc.getVitalsByType('heart_rate', 1)).toHaveLength(1);
  });

  it('getVitalsByType returns empty array for unknown type', () => {
    expect(svc.getVitalsByType('steps')).toHaveLength(0);
  });

  it('getLatestVital returns the most recently added reading', () => {
    const latest = svc.getLatestVital('heart_rate');
    expect(latest).not.toBeNull();
    expect(latest!.value).toBe(72); // added last → at index 0
  });

  it('getLatestVital returns null when no readings exist for that type', () => {
    expect(svc.getLatestVital('sleep')).toBeNull();
  });
});

// ─── steps ────────────────────────────────────────────────────────────────────

describe('HealthDataService – steps', () => {
  beforeEach(() => {
    clearStore();
    resetService();
    jest.clearAllMocks();
    (svc as any).isInitialized = true;
  });

  it('getTodaySteps returns null when no steps recorded', () => {
    expect(svc.getTodaySteps()).toBeNull();
  });

  it('getTodaySteps sums multiple step readings for today', () => {
    const today = new Date().toISOString().split('T')[0];
    injectReading('steps', 3000, `${today}T08:00:00Z`, { unit: 'steps' });
    injectReading('steps', 2500, `${today}T12:00:00Z`, { unit: 'steps' });

    const result = svc.getTodaySteps();
    expect(result).not.toBeNull();
    expect(result!.count).toBe(5500);
    expect(result!.goal).toBe(7000);
  });

  it("getTodaySteps excludes yesterday's steps", () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    injectReading('steps', 9000, `${yesterday}T10:00:00Z`, { unit: 'steps' });
    expect(svc.getTodaySteps()).toBeNull();
  });

  it('getStepsComparison – exceeded when steps >= goal', () => {
    const today = new Date().toISOString().split('T')[0];
    injectReading('steps', 8000, `${today}T09:00:00Z`, { unit: 'steps' }); // 114%
    expect(svc.getStepsComparison().status).toBe('exceeded');
  });

  it('getStepsComparison – met when 80%–99%', () => {
    const today = new Date().toISOString().split('T')[0];
    injectReading('steps', 5900, `${today}T09:00:00Z`, { unit: 'steps' }); // 84%
    expect(svc.getStepsComparison().status).toBe('met');
  });

  it('getStepsComparison – near when 50%–79%', () => {
    const today = new Date().toISOString().split('T')[0];
    injectReading('steps', 4000, `${today}T09:00:00Z`, { unit: 'steps' }); // 57%
    expect(svc.getStepsComparison().status).toBe('near');
  });

  it('getStepsComparison – below when < 50%', () => {
    const today = new Date().toISOString().split('T')[0];
    injectReading('steps', 1000, `${today}T09:00:00Z`, { unit: 'steps' }); // 14%
    expect(svc.getStepsComparison().status).toBe('below');
  });

  it('setStepsGoal persists the new goal to AsyncStorage', async () => {
    jest.clearAllMocks();
    await svc.setStepsGoal(10000);

    expect(AsyncStorage.setItem).toHaveBeenCalledWith('@karuna_steps_goal', '10000');
    expect(svc.getStepsComparison().goal).toBe(10000);
  });
});

// ─── getVitalSummary ─────────────────────────────────────────────────────────

describe('HealthDataService – getVitalSummary', () => {
  beforeEach(() => {
    clearStore();
    resetService();
    jest.clearAllMocks();
    (svc as any).isInitialized = true;
  });

  it('returns unknown trend and undefined stats when no readings', () => {
    const summary = svc.getVitalSummary('heart_rate', 'week');
    expect(summary.trend).toBe('unknown');
    expect(summary.average).toBeUndefined();
    expect(summary.min).toBeUndefined();
    expect(summary.max).toBeUndefined();
  });

  it('calculates average, min and max correctly', () => {
    const now = new Date();
    [60, 80, 100].forEach((v, i) =>
      injectReading('heart_rate', v, new Date(now.getTime() - i * 60000).toISOString(), { unit: 'bpm' })
    );

    const summary = svc.getVitalSummary('heart_rate', 'day');
    expect(summary.average).toBe(80);
    expect(summary.min).toBe(60);
    expect(summary.max).toBe(100);
  });

  it('reports trend=up when recent values are >5% higher than older values', () => {
    // The service stores vitals newest-first (unshift). getReadingsForPeriod preserves
    // that order, so values[0..mid-1] = MOST RECENT, values[mid..] = OLDER.
    // Inject newest first so the array order matches: recent(high) → older(low).
    const now = Date.now();
    // Recent half — high values (injected first = index 0..3 in array)
    [83, 81, 82, 80].forEach((v, i) =>
      injectReading('heart_rate', v, new Date(now - i * 3600000).toISOString(), { unit: 'bpm' })
    );
    // Older half — low values (injected second = index 4..7 in array)
    [63, 61, 62, 60].forEach((v, i) =>
      injectReading('heart_rate', v, new Date(now - (4 + i) * 3600000).toISOString(), { unit: 'bpm' })
    );

    expect(svc.getVitalSummary('heart_rate', 'week').trend).toBe('up');
  });

  it('reports trend=down when recent values are >5% lower than older values', () => {
    // Recent half — low values (injected first = index 0..3)
    const now = Date.now();
    [63, 61, 62, 60].forEach((v, i) =>
      injectReading('heart_rate', v, new Date(now - i * 3600000).toISOString(), { unit: 'bpm' })
    );
    // Older half — high values (injected second = index 4..7)
    [93, 91, 92, 90].forEach((v, i) =>
      injectReading('heart_rate', v, new Date(now - (4 + i) * 3600000).toISOString(), { unit: 'bpm' })
    );

    expect(svc.getVitalSummary('heart_rate', 'week').trend).toBe('down');
  });

  it('reports trend=stable when values are within 5% of each other', () => {
    const now = Date.now();
    [72, 73, 72, 74, 73, 72, 74, 73].forEach((v, i) =>
      injectReading('heart_rate', v, new Date(now - i * 3600000).toISOString(), { unit: 'bpm' })
    );

    expect(svc.getVitalSummary('heart_rate', 'week').trend).toBe('stable');
  });

  it('includes correct displayName and unit from VITAL_TYPE_INFO', () => {
    const summary = svc.getVitalSummary('blood_glucose', 'day');
    expect(summary.displayName).toBe('Blood Glucose');
    expect(summary.unit).toBe('mg/dL');
  });

  it('latestReading is the reading with the most recent timestamp (index 0 in newest-first array)', () => {
    const now = Date.now();
    // Inject newest first so it lands at index 0 — matching how addVitalReading uses unshift
    injectReading('weight', 69, new Date(now).toISOString(), { unit: 'kg' });
    injectReading('weight', 68, new Date(now - 5000).toISOString(), { unit: 'kg' });

    const summary = svc.getVitalSummary('weight', 'week');
    expect(summary.latestReading?.value).toBe(69);
  });
});

// ─── deleteVitalReading ───────────────────────────────────────────────────────

describe('HealthDataService – deleteVitalReading', () => {
  beforeEach(() => {
    clearStore();
    resetService();
    jest.clearAllMocks();
    (svc as any).isInitialized = true;
  });

  it('removes the reading and returns true', async () => {
    const reading = await svc.addVitalReading(makeReading('heart_rate', 70, { unit: 'bpm' }));
    const result = await svc.deleteVitalReading(reading.id);

    expect(result).toBe(true);
    expect(svc.getVitalsByType('heart_rate')).toHaveLength(0);
  });

  it('returns false for an unknown id', async () => {
    expect(await svc.deleteVitalReading('ghost_id')).toBe(false);
  });

  it('logs an audit entry after deletion', async () => {
    const { auditLogService } = require('../../src/services/auditLog');
    const reading = await svc.addVitalReading(makeReading('temperature', 98.6, { unit: '°F' }));
    await svc.deleteVitalReading(reading.id);

    expect(auditLogService.logVaultAccess).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'deleted', entityType: 'vital_reading' })
    );
  });
});

// ─── clearAllVitals ───────────────────────────────────────────────────────────

describe('HealthDataService – clearAllVitals', () => {
  beforeEach(async () => {
    clearStore();
    resetService();
    jest.clearAllMocks();
    (svc as any).isInitialized = true;

    await svc.addVitalReading(makeReading('heart_rate', 72, { unit: 'bpm' }));
    await svc.addVitalReading(makeReading('weight', 70, { unit: 'kg' }));
  });

  it('removes all vitals', async () => {
    await svc.clearAllVitals();
    expect(svc.exportVitals()).toHaveLength(0);
  });

  it('persists empty state to AsyncStorage', async () => {
    jest.clearAllMocks();
    await svc.clearAllVitals();

    expect(AsyncStorage.setItem).toHaveBeenCalledWith('@karuna_health_vitals', '[]');
  });

  it('logs a data_deleted audit entry', async () => {
    const { auditLogService } = require('../../src/services/auditLog');
    await svc.clearAllVitals();

    expect(auditLogService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'data_deleted' })
    );
  });
});

// ─── exportVitals ─────────────────────────────────────────────────────────────

describe('HealthDataService – exportVitals', () => {
  beforeEach(async () => {
    clearStore();
    resetService();
    jest.clearAllMocks();
    (svc as any).isInitialized = true;

    await svc.addVitalReading(makeReading('oxygen_saturation', 98, { unit: '%' }));
  });

  it('returns all vitals', () => {
    expect(svc.exportVitals()).toHaveLength(1);
  });

  it('returns a copy — mutation does not affect internal state', () => {
    const exported = svc.exportVitals();
    exported.splice(0);
    expect(svc.exportVitals()).toHaveLength(1);
  });
});

// ─── getSyncStatus / isConnected ─────────────────────────────────────────────

describe('HealthDataService – sync status', () => {
  beforeEach(() => {
    clearStore();
    resetService();
    jest.clearAllMocks();
    (svc as any).isInitialized = true;
  });

  it('isConnected returns false by default', () => {
    expect(svc.isConnected()).toBe(false);
  });

  it('getSyncStatus returns a snapshot with required fields', () => {
    const status = svc.getSyncStatus();
    expect(status).toHaveProperty('isConnected');
    expect(status).toHaveProperty('permissionsGranted');
    expect(status).toHaveProperty('permissionsDenied');
  });

  it('getSyncStatus returns a copy — mutation does not affect internal state', () => {
    const status = svc.getSyncStatus();
    status.isConnected = true;
    expect(svc.isConnected()).toBe(false);
  });
});

// ─── requestPermissions ───────────────────────────────────────────────────────

describe('HealthDataService – requestPermissions', () => {
  beforeEach(() => {
    clearStore();
    resetService();
    jest.clearAllMocks();
    (svc as any).isInitialized = true;
  });

  it('grants all requested types when consent is given and no native adapter', async () => {
    const result = await svc.requestPermissions(['heart_rate', 'weight', 'steps']);

    expect(result.granted).toEqual(expect.arrayContaining(['heart_rate', 'weight', 'steps']));
    expect(result.denied).toHaveLength(0);
  });

  it('denies all types when consent is not granted', async () => {
    const { consentService } = require('../../src/services/consent');
    (consentService.hasConsent as jest.Mock).mockReturnValueOnce(false);

    const result = await svc.requestPermissions(['heart_rate', 'steps']);

    expect(result.granted).toHaveLength(0);
    expect(result.denied).toEqual(expect.arrayContaining(['heart_rate', 'steps']));
  });

  it('sets isConnected=true when at least one type is granted', async () => {
    await svc.requestPermissions(['heart_rate']);
    expect(svc.isConnected()).toBe(true);
  });

  it('persists sync status to AsyncStorage after grant', async () => {
    jest.clearAllMocks();
    await svc.requestPermissions(['weight']);

    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      '@karuna_health_sync_status',
      expect.stringContaining('weight')
    );
  });
});

// ─── syncFromHealthPlatform ───────────────────────────────────────────────────

describe('HealthDataService – syncFromHealthPlatform', () => {
  beforeEach(() => {
    clearStore();
    resetService();
    jest.clearAllMocks();
    (svc as any).isInitialized = true;
  });

  it('returns success=false when not connected', async () => {
    const result = await svc.syncFromHealthPlatform();
    expect(result.success).toBe(false);
    expect(result.error).toContain('Not connected');
  });

  it('returns success=false when consent is revoked', async () => {
    (svc as any).syncStatus.isConnected = true;
    const { consentService } = require('../../src/services/consent');
    (consentService.hasConsent as jest.Mock).mockReturnValueOnce(false);

    const result = await svc.syncFromHealthPlatform();
    expect(result.success).toBe(false);
    expect(result.error).toContain('consent');
  });
});
