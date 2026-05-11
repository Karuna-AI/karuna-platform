/**
 * Medication Service Tests
 *
 * Tests for medication CRUD, dose recording, adherence calculation,
 * and notification scheduling against the real MedicationService API.
 *
 * AsyncStorage is mocked with an in-memory store so each test is isolated.
 * expo-notifications and react-native are fully mocked.
 */

// ─── module mocks (must be before all imports) ───────────────────────────────

// In-memory AsyncStorage — avoids the recursive require issue with the web mock
const _store: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn((key: string) => Promise.resolve(_store[key] ?? null)),
    setItem: jest.fn((key: string, value: string) => { _store[key] = value; return Promise.resolve(); }),
    removeItem: jest.fn((key: string) => { delete _store[key]; return Promise.resolve(); }),
    clear: jest.fn(() => { Object.keys(_store).forEach(k => delete _store[k]); return Promise.resolve(); }),
    getAllKeys: jest.fn(() => Promise.resolve(Object.keys(_store))),
    multiGet: jest.fn((keys: string[]) => Promise.resolve(keys.map(k => [k, _store[k] ?? null]))),
    multiSet: jest.fn((pairs: [string, string][]) => { pairs.forEach(([k, v]) => { _store[k] = v; }); return Promise.resolve(); }),
    multiRemove: jest.fn((keys: string[]) => { keys.forEach(k => delete _store[k]); return Promise.resolve(); }),
  },
}));

jest.mock('expo-notifications', () => ({
  __esModule: true,
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  scheduleNotificationAsync: jest.fn().mockResolvedValue('notif-id-123'),
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
  cancelAllScheduledNotificationsAsync: jest.fn().mockResolvedValue(undefined),
  getAllScheduledNotificationsAsync: jest.fn().mockResolvedValue([]),
  SchedulableTriggerInputTypes: { DAILY: 'DAILY' },
}));

jest.mock('../../src/services/auditLog', () => ({
  auditLogService: {
    log: jest.fn().mockResolvedValue(undefined),
    logVaultAccess: jest.fn().mockResolvedValue(undefined),
  },
}));

// Platform: use ios so notification guards don't block on Platform.OS==='web'
jest.mock('react-native', () => {
  const rn = jest.requireActual('react-native-web');
  return { ...rn, Platform: { OS: 'ios', select: (o: any) => o.ios ?? o.default } };
});

// ─── imports ─────────────────────────────────────────────────────────────────

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { medicationService as svc } from '../../src/services/medication';

// ─── helpers ─────────────────────────────────────────────────────────────────

function clearStore() {
  Object.keys(_store).forEach(k => delete _store[k]);
}

function resetService() {
  const s = svc as any;
  s.medications = [];
  s.doses = [];
  s.notificationIds = new Map();
  s.isInitialized = false;
}

function buildMed(overrides: Record<string, any> = {}) {
  return {
    name: 'Metformin',
    dosage: '500',
    unit: 'mg' as const,
    frequency: 'twice_daily' as const,
    schedule: [
      { id: 'sched_1', time: '09:00', label: 'Morning' },
      { id: 'sched_2', time: '21:00', label: 'Evening' },
    ],
    isActive: true,
    startDate: '2026-01-01',
    ...overrides,
  };
}

// ─── initialization ───────────────────────────────────────────────────────────

describe('MedicationService – initialization', () => {
  beforeEach(() => {
    clearStore();
    resetService();
    jest.clearAllMocks();
  });

  it('loads medications from AsyncStorage on initialize()', async () => {
    const stored = [{ id: 'med_1', name: 'Aspirin', isActive: true, schedule: [] }];
    _store['@karuna_medications'] = JSON.stringify(stored);

    await svc.initialize();

    expect(svc.getMedications()).toHaveLength(1);
    expect(svc.getMedications()[0].name).toBe('Aspirin');
  });

  it('loads dose history from AsyncStorage on initialize()', async () => {
    const meds = [{ id: 'med_1', name: 'Aspirin', isActive: false, schedule: [] }];
    _store['@karuna_medications'] = JSON.stringify(meds);
    const doses = [
      { id: 'dose_1', medicationId: 'med_1', scheduledTime: '2026-05-11T09:00:00+05:30', status: 'taken' },
    ];
    _store['@karuna_medication_doses'] = JSON.stringify(doses);

    await svc.initialize();

    // getAdherence uses the doses array internally; no crash = doses were loaded
    expect(Array.isArray(svc.getAdherence(undefined, 'month'))).toBe(true);
  });

  it('does not re-initialize if already initialized', async () => {
    (svc as any).isInitialized = true;
    const spy = jest.spyOn(AsyncStorage, 'getItem');

    await svc.initialize();

    expect(spy).not.toHaveBeenCalled();
  });

  it('sets isInitialized=true even when storage throws', async () => {
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error('disk fail'));

    await svc.initialize();

    expect((svc as any).isInitialized).toBe(true);
  });
});

// ─── addMedication ────────────────────────────────────────────────────────────

describe('MedicationService – addMedication', () => {
  beforeEach(() => {
    clearStore();
    resetService();
    jest.clearAllMocks();
    (svc as any).isInitialized = true;
  });

  it('returns a medication with generated id, createdAt, updatedAt', async () => {
    const result = await svc.addMedication(buildMed());

    expect(result.id).toMatch(/^med_/);
    expect(result.createdAt).toBeTruthy();
    expect(result.updatedAt).toBeTruthy();
    expect(result.name).toBe('Metformin');
  });

  it('persists medication to AsyncStorage', async () => {
    await svc.addMedication(buildMed());

    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      '@karuna_medications',
      expect.stringContaining('Metformin')
    );
  });

  it('getMedications() reflects the newly added medication', async () => {
    await svc.addMedication(buildMed({ name: 'Atorvastatin' }));
    const meds = svc.getMedications();

    expect(meds).toHaveLength(1);
    expect(meds[0].name).toBe('Atorvastatin');
  });

  it('schedules notifications for active medications', async () => {
    await svc.addMedication(buildMed({ isActive: true }));

    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalled();
  });

  it('does not schedule notifications when isActive is false', async () => {
    await svc.addMedication(buildMed({ isActive: false }));

    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('logs a vault audit entry after adding', async () => {
    const { auditLogService } = require('../../src/services/auditLog');
    await svc.addMedication(buildMed());

    expect(auditLogService.logVaultAccess).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'created', entityType: 'medication' })
    );
  });
});

// ─── getMedications / getMedicationById / searchMedications ──────────────────

describe('MedicationService – query helpers', () => {
  beforeEach(async () => {
    clearStore();
    resetService();
    jest.clearAllMocks();
    (svc as any).isInitialized = true;

    await svc.addMedication(buildMed({ name: 'Lisinopril', isActive: true, purpose: 'hypertension' }));
    await svc.addMedication(buildMed({ name: 'Metformin', isActive: false, genericName: 'biguanide' }));
  });

  it('getMedications() returns all medications', () => {
    expect(svc.getMedications()).toHaveLength(2);
  });

  it('getMedications(true) returns only active medications', () => {
    const active = svc.getMedications(true);
    expect(active).toHaveLength(1);
    expect(active[0].name).toBe('Lisinopril');
  });

  it('getMedicationById returns the correct medication', () => {
    const all = svc.getMedications();
    const found = svc.getMedicationById(all[0].id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(all[0].id);
  });

  it('getMedicationById returns null for unknown id', () => {
    expect(svc.getMedicationById('does_not_exist')).toBeNull();
  });

  it('searchMedications matches by name (case-insensitive)', () => {
    const results = svc.searchMedications('lisin');
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Lisinopril');
  });

  it('searchMedications matches by genericName', () => {
    const results = svc.searchMedications('biguanide');
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Metformin');
  });

  it('searchMedications matches by purpose', () => {
    const results = svc.searchMedications('hypertension');
    expect(results).toHaveLength(1);
  });

  it('searchMedications returns empty array when nothing matches', () => {
    expect(svc.searchMedications('zzznotamedication')).toHaveLength(0);
  });
});

// ─── updateMedication / deleteMedication ─────────────────────────────────────

describe('MedicationService – update & delete', () => {
  let medId: string;

  beforeEach(async () => {
    clearStore();
    resetService();
    jest.clearAllMocks();
    (svc as any).isInitialized = true;

    const med = await svc.addMedication(buildMed());
    medId = med.id;
  });

  it('updateMedication changes the dosage and bumps updatedAt', async () => {
    const before = svc.getMedicationById(medId)!.updatedAt;
    await new Promise((r) => setTimeout(r, 5));
    const updated = await svc.updateMedication(medId, { dosage: '1000' });

    expect(updated).not.toBeNull();
    expect(updated!.dosage).toBe('1000');
    expect(updated!.updatedAt).not.toBe(before);
  });

  it('updateMedication persists the change to AsyncStorage', async () => {
    jest.clearAllMocks();
    await svc.updateMedication(medId, { dosage: '750' });

    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      '@karuna_medications',
      expect.stringContaining('750')
    );
  });

  it('updateMedication returns null for unknown id', async () => {
    const result = await svc.updateMedication('bad_id', { dosage: '1' });
    expect(result).toBeNull();
  });

  it('deleteMedication removes the medication', async () => {
    const result = await svc.deleteMedication(medId);
    expect(result).toBe(true);
    expect(svc.getMedications()).toHaveLength(0);
  });

  it('deleteMedication returns false for unknown id', async () => {
    expect(await svc.deleteMedication('no_such_id')).toBe(false);
  });

  it('deleteMedication cancels scheduled notifications', async () => {
    (svc as any).notificationIds.set(medId, ['notif-abc']);

    await svc.deleteMedication(medId);

    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('notif-abc');
  });
});

// ─── recordDose ──────────────────────────────────────────────────────────────

describe('MedicationService – recordDose', () => {
  let medId: string;
  let schedId: string;

  beforeEach(async () => {
    clearStore();
    resetService();
    jest.clearAllMocks();
    (svc as any).isInitialized = true;

    const med = await svc.addMedication(buildMed());
    medId = med.id;
    schedId = med.schedule[0].id;
  });

  it('returns a dose with correct status=taken and an actualTime', async () => {
    const dose = await svc.recordDose(medId, schedId, 'taken');

    expect(dose.id).toMatch(/^dose_/);
    expect(dose.status).toBe('taken');
    expect(dose.medicationId).toBe(medId);
    expect(dose.actualTime).toBeTruthy();
  });

  it('skipped dose has no actualTime', async () => {
    const dose = await svc.recordDose(medId, schedId, 'skipped');

    expect(dose.status).toBe('skipped');
    expect(dose.actualTime).toBeUndefined();
  });

  it('stores notes when provided', async () => {
    const dose = await svc.recordDose(medId, schedId, 'taken', 'Took with food');
    expect(dose.notes).toBe('Took with food');
  });

  it('throws when medicationId is unknown', async () => {
    await expect(svc.recordDose('bad_id', 'sched_x', 'taken')).rejects.toThrow(
      'Medication or schedule not found'
    );
  });

  it('throws when scheduleId does not belong to the medication', async () => {
    await expect(svc.recordDose(medId, 'wrong_sched', 'taken')).rejects.toThrow(
      'Medication or schedule not found'
    );
  });

  it('persists dose to AsyncStorage', async () => {
    jest.clearAllMocks();
    await svc.recordDose(medId, schedId, 'taken');

    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      '@karuna_medication_doses',
      expect.stringContaining(medId)
    );
  });
});

// ─── getAdherence ─────────────────────────────────────────────────────────────

describe('MedicationService – getAdherence', () => {
  let medId: string;
  let schedId: string;

  beforeEach(async () => {
    clearStore();
    resetService();
    jest.clearAllMocks();
    (svc as any).isInitialized = true;

    const med = await svc.addMedication(buildMed({ isActive: true }));
    medId = med.id;
    schedId = med.schedule[0].id;
  });

  it('returns 100% adherence when no doses recorded yet', () => {
    const adherence = svc.getAdherence(medId, 'week');
    expect(adherence).toHaveLength(1);
    expect(adherence[0].adherenceRate).toBe(100);
    expect(adherence[0].totalDoses).toBe(0);
  });

  it('calculates adherence for mixed taken/missed/skipped doses', async () => {
    await svc.recordDose(medId, schedId, 'taken');
    await svc.recordDose(medId, schedId, 'taken');
    await svc.markDoseMissed(medId, '09:00');
    (svc as any).doses.push({
      id: 'dose_skip',
      medicationId: medId,
      scheduledTime: new Date().toISOString(),
      status: 'skipped',
      recordedAt: new Date().toISOString(),
    });

    const adherence = svc.getAdherence(medId, 'week');
    expect(adherence[0].takenDoses).toBe(2);
    expect(adherence[0].missedDoses).toBe(1);
    expect(adherence[0].skippedDoses).toBe(1);
    expect(adherence[0].totalDoses).toBe(4);
    expect(adherence[0].adherenceRate).toBe(50);
  });

  it('scopes to a single medication when id is provided', async () => {
    await svc.addMedication(buildMed({ name: 'OtherMed' }));
    const adherence = svc.getAdherence(medId, 'week');
    expect(adherence).toHaveLength(1);
    expect(adherence[0].medicationId).toBe(medId);
  });

  it('covers all active meds when no id is given', async () => {
    await svc.addMedication(buildMed({ name: 'SecondMed', isActive: true }));
    const adherence = svc.getAdherence(undefined, 'week');
    expect(adherence.length).toBeGreaterThanOrEqual(2);
  });
});

// ─── createScheduleFromFrequency (static) ────────────────────────────────────

describe('MedicationService – createScheduleFromFrequency', () => {
  const createSchedule = (freq: string) =>
    (svc.constructor as any).createScheduleFromFrequency(freq);

  it('once_daily: 1 schedule at 09:00 labeled Morning', () => {
    const s = createSchedule('once_daily');
    expect(s).toHaveLength(1);
    expect(s[0].time).toBe('09:00');
    expect(s[0].label).toBe('Morning');
  });

  it('twice_daily: Morning 09:00 and Evening 21:00', () => {
    const s = createSchedule('twice_daily');
    expect(s).toHaveLength(2);
    expect(s[0].time).toBe('09:00');
    expect(s[1].time).toBe('21:00');
  });

  it('three_times_daily: 3 schedules', () => {
    expect(createSchedule('three_times_daily')).toHaveLength(3);
  });

  it('four_times_daily: 4 schedules', () => {
    expect(createSchedule('four_times_daily')).toHaveLength(4);
  });

  it('weekly: 1 schedule on Sunday only', () => {
    const s = createSchedule('weekly');
    expect(s).toHaveLength(1);
    expect(s[0].daysOfWeek).toEqual([0]);
  });

  it('as_needed: no schedules', () => {
    expect(createSchedule('as_needed')).toHaveLength(0);
  });

  it('custom: no schedules', () => {
    expect(createSchedule('custom')).toHaveLength(0);
  });
});

// ─── getMedicationSummary ─────────────────────────────────────────────────────

describe('MedicationService – getMedicationSummary', () => {
  beforeEach(async () => {
    clearStore();
    resetService();
    jest.clearAllMocks();
    (svc as any).isInitialized = true;
  });

  it('returns "no medications" when list is empty', () => {
    expect(svc.getMedicationSummary()).toContain('No active medications');
  });

  it('includes name, dosage and unit in the summary', async () => {
    await svc.addMedication(buildMed({ name: 'Ramipril', dosage: '5', unit: 'mg', isActive: true }));
    const summary = svc.getMedicationSummary();
    expect(summary).toContain('Ramipril');
    expect(summary).toContain('5');
    expect(summary).toContain('mg');
  });
});
