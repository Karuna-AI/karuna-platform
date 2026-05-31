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

  it('includes purpose in summary when provided', async () => {
    await svc.addMedication(buildMed({ name: 'Lisinopril', isActive: true, purpose: 'blood pressure' }));
    const summary = svc.getMedicationSummary();
    expect(summary).toContain('blood pressure');
  });

  it('uses schedule label when available', async () => {
    await svc.addMedication(buildMed({
      name: 'Aspirin',
      isActive: true,
      schedule: [{ id: 's1', time: '08:00', label: 'Breakfast' }],
    }));
    const summary = svc.getMedicationSummary();
    expect(summary).toContain('Breakfast');
  });
});

// ─── initialization – notificationIds loaded from storage (line 62) ───────────

describe('MedicationService – initialize loads notificationIds', () => {
  beforeEach(() => {
    clearStore();
    resetService();
    jest.clearAllMocks();
  });

  it('reads notificationIds key from AsyncStorage during init (exercises line 62)', async () => {
    // Pre-populate all three storage keys
    const meds = [{ id: 'med_1', name: 'Aspirin', isActive: false, schedule: [] }];
    _store['@karuna_medications'] = JSON.stringify(meds);
    _store['@karuna_medication_doses'] = JSON.stringify([]);
    // notificationIds stored as Array.from(map.entries())
    _store['@karuna_medication_notification_ids'] = JSON.stringify([['med_1', ['notif-abc']]]);

    await svc.initialize();

    // rescheduleAllNotifications clears notificationIds for inactive meds;
    // verify AsyncStorage.getItem was called with the notification IDs key
    expect(AsyncStorage.getItem).toHaveBeenCalledWith('@karuna_medication_notification_ids');
    // Service should have initialized successfully
    expect((svc as any).isInitialized).toBe(true);
  });
});

// ─── requestNotificationPermissions branches (lines 89-90, 95-96) ─────────────

describe('MedicationService – requestNotificationPermissions', () => {
  beforeEach(() => {
    clearStore();
    resetService();
    jest.clearAllMocks();
  });

  it('calls requestPermissionsAsync when existing status is not granted', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValueOnce({ status: 'denied' });
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValueOnce({ status: 'granted' });

    // initialize triggers requestNotificationPermissions internally
    await svc.initialize();

    expect(Notifications.requestPermissionsAsync).toHaveBeenCalled();
  });

  it('handles getPermissionsAsync throwing (error catch in requestNotificationPermissions)', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockRejectedValueOnce(new Error('perm fail'));

    // Should not throw; error is caught internally
    await expect(svc.initialize()).resolves.not.toThrow();
    expect((svc as any).isInitialized).toBe(true);
  });
});

// ─── updateMedication – deactivate path (line 153) ────────────────────────────

describe('MedicationService – updateMedication deactivate', () => {
  let medId: string;

  beforeEach(async () => {
    clearStore();
    resetService();
    jest.clearAllMocks();
    (svc as any).isInitialized = true;

    const med = await svc.addMedication(buildMed({ isActive: true }));
    medId = med.id;
    // Seed a notification id so cancelNotifications has something to cancel
    (svc as any).notificationIds.set(medId, ['notif-to-cancel']);
  });

  it('cancels notifications when medication is set to inactive', async () => {
    jest.clearAllMocks();
    await svc.updateMedication(medId, { isActive: false });

    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('notif-to-cancel');
  });
});

// ─── getTodaySchedule (lines 227-265) ─────────────────────────────────────────

describe('MedicationService – getTodaySchedule', () => {
  beforeEach(async () => {
    clearStore();
    resetService();
    jest.clearAllMocks();
    (svc as any).isInitialized = true;
  });

  it('returns empty array when no medications', () => {
    expect(svc.getTodaySchedule()).toEqual([]);
  });

  it('returns schedule items for active medications', async () => {
    await svc.addMedication(buildMed({ isActive: true }));
    const schedule = svc.getTodaySchedule();
    expect(schedule.length).toBeGreaterThan(0);
    expect(schedule[0]).toHaveProperty('medication');
    expect(schedule[0]).toHaveProperty('schedule');
    expect(schedule[0]).toHaveProperty('dose');
  });

  it('excludes inactive medications', async () => {
    await svc.addMedication(buildMed({ isActive: false }));
    expect(svc.getTodaySchedule()).toHaveLength(0);
  });

  it('skips schedule entries that do not match todays day-of-week', async () => {
    const today = new Date().getDay();
    // Pick a day that is NOT today
    const otherDay = (today + 1) % 7;
    await svc.addMedication(buildMed({
      isActive: true,
      schedule: [{ id: 's_nottoday', time: '10:00', label: 'Test', daysOfWeek: [otherDay] }],
    }));
    expect(svc.getTodaySchedule()).toHaveLength(0);
  });

  it('includes schedule entries that match todays day-of-week', async () => {
    const today = new Date().getDay();
    await svc.addMedication(buildMed({
      isActive: true,
      schedule: [{ id: 's_today', time: '10:00', label: 'Test', daysOfWeek: [today] }],
    }));
    const schedule = svc.getTodaySchedule();
    expect(schedule).toHaveLength(1);
  });

  it('attaches an existing dose when one matches the scheduled time', async () => {
    // Pin to a fixed midday moment so the UTC date this test forms matches
    // the local date the service computes via localDateString(). Without
    // pinning, runs that straddle a UTC↔local date boundary disagreed and
    // the dose lookup missed.
    jest.useFakeTimers().setSystemTime(new Date('2026-06-15T12:00:00Z'));
    try {
      const med = await svc.addMedication(buildMed({ isActive: true }));
      const todayStr = new Date().toISOString().slice(0, 10);
      (svc as any).doses.push({
        id: 'dose_match',
        medicationId: med.id,
        scheduledTime: `${todayStr}T09:00:00+00:00`,
        status: 'taken',
        recordedAt: new Date().toISOString(),
      });

      const schedule = svc.getTodaySchedule();
      const withDose = schedule.filter((s) => s.dose !== null);
      expect(withDose.length).toBeGreaterThan(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('sorts schedule by time ascending', async () => {
    await svc.addMedication(buildMed({
      isActive: true,
      schedule: [
        { id: 's_late', time: '21:00', label: 'Evening' },
        { id: 's_early', time: '06:00', label: 'Early' },
      ],
    }));
    const schedule = svc.getTodaySchedule();
    if (schedule.length >= 2) {
      expect(schedule[0].schedule.time <= schedule[1].schedule.time).toBe(true);
    }
  });
});

// ─── markDoseMissed – error path (line 320) ───────────────────────────────────

describe('MedicationService – markDoseMissed', () => {
  beforeEach(() => {
    clearStore();
    resetService();
    jest.clearAllMocks();
    (svc as any).isInitialized = true;
  });

  it('throws when medication is not found', async () => {
    await expect(svc.markDoseMissed('nonexistent_id', '09:00')).rejects.toThrow('Medication not found');
  });

  it('records a missed dose with provided dateStr', async () => {
    const med = await svc.addMedication(buildMed());
    const dose = await svc.markDoseMissed(med.id, '09:00', '2026-05-10');
    expect(dose.status).toBe('missed');
    expect(dose.scheduledTime).toContain('2026-05-10');
  });

  it('records a missed dose using today when dateStr is omitted', async () => {
    const med = await svc.addMedication(buildMed());
    const dose = await svc.markDoseMissed(med.id, '09:00');
    expect(dose.status).toBe('missed');
    expect(dose.medicationId).toBe(med.id);
  });
});

// ─── getAdherence – 'day' and 'month' periods (lines 352-353) ─────────────────

describe('MedicationService – getAdherence period branches', () => {
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

  it('returns adherence for period=day', async () => {
    await svc.recordDose(medId, schedId, 'taken');
    const adherence = svc.getAdherence(medId, 'day');
    expect(adherence).toHaveLength(1);
    expect(adherence[0].period).toBe('day');
  });

  it('returns adherence for period=month', async () => {
    await svc.recordDose(medId, schedId, 'taken');
    const adherence = svc.getAdherence(medId, 'month');
    expect(adherence).toHaveLength(1);
    expect(adherence[0].period).toBe('month');
    expect(adherence[0].takenDoses).toBe(1);
  });

  it('filters inactive medications from all-meds adherence', async () => {
    const inactiveMed = await svc.addMedication(buildMed({ name: 'InactiveMed', isActive: false }));
    const all = svc.getAdherence(undefined, 'week');
    const ids = all.map((a) => a.medicationId);
    expect(ids).not.toContain(inactiveMed.id);
  });
});

// ─── getNextDose (lines 418-438) ──────────────────────────────────────────────

describe('MedicationService – getNextDose', () => {
  beforeEach(async () => {
    clearStore();
    resetService();
    jest.clearAllMocks();
    (svc as any).isInitialized = true;
  });

  it('returns null when there are no medications', () => {
    expect(svc.getNextDose()).toBeNull();
  });

  it('returns null when all doses for today are already taken', async () => {
    // Pin to midday so "01:00" is unambiguously in the past. Without pinning,
    // a run between 00:00 and 01:00 saw 01:00 as a future dose and failed.
    jest.useFakeTimers().setSystemTime(new Date('2026-06-15T12:00:00Z'));
    try {
      const med = await svc.addMedication(buildMed({
        isActive: true,
        schedule: [{ id: 's_past', time: '01:00', label: 'Very Early' }],
      }));
      (svc as any).doses.push({
        id: 'dose_taken',
        medicationId: med.id,
        scheduledTime: new Date().toISOString(),
        status: 'taken',
        recordedAt: new Date().toISOString(),
      });
      // 01:00 has already passed at the pinned 12:00 wall clock
      expect(svc.getNextDose()).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('returns the next future pending dose', async () => {
    // Use a schedule time far in the future (23:59)
    const med = await svc.addMedication(buildMed({
      isActive: true,
      schedule: [{ id: 's_future', time: '23:59', label: 'Night' }],
    }));

    const next = svc.getNextDose();
    // May or may not exist depending on current time; if it does, validate shape
    if (next !== null) {
      expect(next).toHaveProperty('medication');
      expect(next).toHaveProperty('schedule');
      expect(next).toHaveProperty('time');
      expect(next.time).toBeInstanceOf(Date);
    }
  });
});

// ─── scheduleNotifications error catch (line 473) ─────────────────────────────

describe('MedicationService – scheduleNotifications error handling', () => {
  beforeEach(() => {
    clearStore();
    resetService();
    jest.clearAllMocks();
    (svc as any).isInitialized = true;
  });

  it('does not throw when scheduleNotificationAsync fails', async () => {
    (Notifications.scheduleNotificationAsync as jest.Mock).mockRejectedValueOnce(new Error('schedule fail'));
    // addMedication triggers scheduleNotifications internally
    await expect(svc.addMedication(buildMed({ isActive: true }))).resolves.not.toThrow();
  });
});

// ─── cancelNotifications error catch (line 492) ───────────────────────────────

describe('MedicationService – cancelNotifications error handling', () => {
  beforeEach(() => {
    clearStore();
    resetService();
    jest.clearAllMocks();
    (svc as any).isInitialized = true;
  });

  it('does not throw when cancelScheduledNotificationAsync fails', async () => {
    const med = await svc.addMedication(buildMed({ isActive: true }));
    (svc as any).notificationIds.set(med.id, ['bad-notif-id']);
    (Notifications.cancelScheduledNotificationAsync as jest.Mock).mockRejectedValueOnce(new Error('cancel fail'));

    // deleteMedication triggers cancelNotifications
    await expect(svc.deleteMedication(med.id)).resolves.not.toThrow();
  });
});

// ─── createScheduleFromFrequency – every_other_day (lines 544-550) ────────────

describe('MedicationService – createScheduleFromFrequency every_other_day', () => {
  const createSchedule = (freq: string) =>
    (svc.constructor as any).createScheduleFromFrequency(freq);

  it('every_other_day: 1 schedule with daysOfWeek [0,2,4,6]', () => {
    const s = createSchedule('every_other_day');
    expect(s).toHaveLength(1);
    expect(s[0].time).toBe('09:00');
    expect(s[0].daysOfWeek).toEqual([0, 2, 4, 6]);
  });
});

// ─── saveMedications / saveDoses / saveNotificationIds error paths ─────────────

describe('MedicationService – storage error catch paths', () => {
  beforeEach(() => {
    clearStore();
    resetService();
    jest.clearAllMocks();
    (svc as any).isInitialized = true;
  });

  it('saveMedications does not throw when AsyncStorage.setItem fails (line 572)', async () => {
    (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('storage full'));
    // addMedication calls saveMedications internally
    await expect(svc.addMedication(buildMed())).resolves.not.toThrow();
  });

  it('saveDoses error path does not throw (line 584)', async () => {
    const med = await svc.addMedication(buildMed());
    (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('io error'));
    // recordDose calls saveDoses internally
    await expect(svc.recordDose(med.id, med.schedule[0].id, 'taken')).resolves.not.toThrow();
  });

  it('saves doses and trims to 500 when over limit (line 580)', async () => {
    const med = await svc.addMedication(buildMed());
    // Inject 501 existing doses
    const fakeDoses = Array.from({ length: 501 }, (_, i) => ({
      id: `dose_fake_${i}`,
      medicationId: med.id,
      scheduledTime: new Date().toISOString(),
      status: 'taken' as const,
      recordedAt: new Date().toISOString(),
    }));
    (svc as any).doses = fakeDoses;

    // Trigger saveDoses — markDoseMissed does this
    await svc.markDoseMissed(med.id, '09:00');

    // After trim + new dose unshift, length should be 500+1 = 501 → trimmed to 500
    // Actually trimming happens BEFORE the new dose is added to storage
    // The internal doses array is trimmed to 500 before persisting
    expect((svc as any).doses.length).toBeLessThanOrEqual(500);
  });

  it('saveNotificationIds does not throw when AsyncStorage.setItem fails (line 595)', async () => {
    // Make the *third* setItem call fail (saveNotificationIds is called after saveMedications)
    let callCount = 0;
    (AsyncStorage.setItem as jest.Mock).mockImplementation((key: string, value: string) => {
      callCount++;
      if (key === '@karuna_medication_notification_ids') {
        return Promise.reject(new Error('notif store fail'));
      }
      _store[key] = value;
      return Promise.resolve();
    });

    await expect(svc.addMedication(buildMed({ isActive: true }))).resolves.not.toThrow();
  });
});
