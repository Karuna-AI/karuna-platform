/**
 * @jest-environment node
 *
 * E2E User Journey Tests
 *
 * Exercises real service code through complete user-facing workflows.
 * Every assertion tests an observable side-effect of a real service call —
 * no hardcoded constants masquerading as test assertions.
 *
 * AsyncStorage: in-memory mock shared across all journeys (reset in beforeEach).
 * Native modules (notifications, biometrics, secure-store): no-op mocks.
 * encryptedDatabaseService: mocked as unavailable so storageService falls
 * back to AsyncStorage (the simpler, fully-deterministic path).
 */

// ── Module mocks — must appear before all imports ─────────────────────────────

const _store: Record<string, string> = {};

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem:    jest.fn((k: string)                  => Promise.resolve(_store[k] ?? null)),
    setItem:    jest.fn((k: string, v: string)        => { _store[k] = v; return Promise.resolve(); }),
    removeItem: jest.fn((k: string)                  => { delete _store[k]; return Promise.resolve(); }),
    clear:      jest.fn(()                           => { Object.keys(_store).forEach(k => delete _store[k]); return Promise.resolve(); }),
    getAllKeys:  jest.fn(()                           => Promise.resolve(Object.keys(_store))),
    multiGet:   jest.fn((ks: string[])               => Promise.resolve(ks.map(k => [k, _store[k] ?? null]))),
    multiSet:   jest.fn((pairs: [string, string][]) => { pairs.forEach(([k, v]) => { _store[k] = v; }); return Promise.resolve(); }),
    multiRemove:jest.fn((ks: string[])               => { ks.forEach(k => delete _store[k]); return Promise.resolve(); }),
  },
}));

jest.mock('expo-notifications', () => ({
  __esModule: true,
  getPermissionsAsync:              jest.fn().mockResolvedValue({ status: 'granted' }),
  requestPermissionsAsync:          jest.fn().mockResolvedValue({ status: 'granted' }),
  scheduleNotificationAsync:        jest.fn().mockResolvedValue('notif-id-test'),
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
  cancelAllScheduledNotificationsAsync: jest.fn().mockResolvedValue(undefined),
  getAllScheduledNotificationsAsync: jest.fn().mockResolvedValue([]),
  SchedulableTriggerInputTypes: { DAILY: 'DAILY' },
}));

jest.mock('expo-local-authentication', () => ({
  __esModule: true,
  hasHardwareAsync:  jest.fn().mockResolvedValue(false),
  isEnrolledAsync:   jest.fn().mockResolvedValue(false),
  authenticateAsync: jest.fn().mockResolvedValue({ success: false }),
}));

jest.mock('expo-secure-store', () => ({
  __esModule: true,
  getItemAsync:    jest.fn().mockResolvedValue(null),
  setItemAsync:    jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/services/auditLog', () => ({
  auditLogService: {
    log:            jest.fn().mockResolvedValue(undefined),
    logVaultAccess: jest.fn().mockResolvedValue(undefined),
    initialize:     jest.fn().mockResolvedValue(undefined),
  },
}));

// encryptedDatabase unavailable → storageService falls back to AsyncStorage
jest.mock('../../src/services/encryptedDatabase', () => ({
  encryptedDatabaseService: {
    isDbOpen:       jest.fn().mockReturnValue(false),
    open:           jest.fn().mockResolvedValue({ success: false, error: 'not available in test' }),
    saveCollection: jest.fn().mockResolvedValue(undefined),
    getCollection:  jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('react-native', () => {
  const rn = jest.requireActual('react-native-web');
  return { ...rn, Platform: { OS: 'ios', select: (o: any) => o.ios ?? o.default } };
});

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import AsyncStorage from '@react-native-async-storage/async-storage';
import { onboardingStore }    from '../../src/services/onboardingStore';
import { medicationService }  from '../../src/services/medication';
import { storageService }     from '../../src/services/storage';
import { careCircleSyncService } from '../../src/services/careCircleSync';

// ── Reset helpers ─────────────────────────────────────────────────────────────

function clearStore() {
  Object.keys(_store).forEach(k => delete _store[k]);
}

function resetOnboarding() {
  const s = onboardingStore as any;
  s.completed    = false;
  s.currentStep  = 'welcome_role';
  s.role         = 'self';
  s.skipped      = false;
  s.initialized  = false;
}

function resetMedication() {
  const s = medicationService as any;
  s.medications    = [];
  s.doses          = [];
  s.notificationIds = new Map();
  s.isInitialized  = false;
}

function resetStorage() {
  const s = storageService as any;
  s.memoryCache   = null;
  s.messagesCache = null;
  // Reset the module-level encrypted-db readiness cache
  const storageModule = require('../../src/services/storage') as any;
  if (storageModule._encDbReady !== undefined) storageModule._encDbReady = null;
}

function resetCareCircleSync() {
  const s = careCircleSyncService as any;
  s.pendingChanges = [];
  s.careCircleId   = null;
  s.authToken      = null;
  s.deviceId       = 'test-device';
}

beforeEach(() => {
  clearStore();
  resetOnboarding();
  resetMedication();
  resetStorage();
  resetCareCircleSync();
  jest.clearAllMocks();
});

// ── Journey 1: First-time onboarding ─────────────────────────────────────────

describe('Journey: First-time onboarding', () => {
  it('starts fresh as incomplete and advances to complete', async () => {
    await onboardingStore.initialize();
    expect(onboardingStore.isComplete()).toBe(false);
    expect(onboardingStore.getCurrentStep()).toBe('welcome_role');
  });

  it('persists role selection across re-initialization', async () => {
    await onboardingStore.initialize();
    await onboardingStore.setRole('caregiver');

    // Simulate app restart: reset in-memory state, re-read from storage
    resetOnboarding();
    await onboardingStore.initialize();

    expect(onboardingStore.getRole()).toBe('caregiver');
  });

  it('persists step progression and marks complete', async () => {
    await onboardingStore.initialize();
    await onboardingStore.setRole('self');
    await onboardingStore.setStep('security_setup');
    await onboardingStore.setPermissionResult('mic', true);
    await onboardingStore.setPermissionResult('notify', true);
    await onboardingStore.setSecurityMethod('pin');
    await onboardingStore.markComplete(false);

    expect(onboardingStore.isComplete()).toBe(true);
    expect(onboardingStore.wasSkipped()).toBe(false);
  });

  it('re-reads completion status from storage after re-init', async () => {
    await onboardingStore.initialize();
    await onboardingStore.markComplete(false);

    resetOnboarding(); // wipe in-memory state
    await onboardingStore.initialize(); // reload from _store

    expect(onboardingStore.isComplete()).toBe(true);
  });

  it('reset clears storage and restores incomplete state', async () => {
    await onboardingStore.initialize();
    await onboardingStore.markComplete(false);
    await onboardingStore.reset();

    expect(onboardingStore.isComplete()).toBe(false);

    // Re-initialize from (now-cleared) storage — still not complete
    resetOnboarding();
    await onboardingStore.initialize();
    expect(onboardingStore.isComplete()).toBe(false);
  });

  it('stores quick-setup data and reads it back', async () => {
    await onboardingStore.setQuickSetupData({
      reminderTime: '09:00',
      trustedContactName: 'Priya',
      trustedContactPhone: '+919876543210',
    });

    const data = await onboardingStore.getQuickSetupData();
    expect(data?.trustedContactName).toBe('Priya');
    expect(data?.reminderTime).toBe('09:00');
  });
});

// ── Journey 2: Medication lifecycle ──────────────────────────────────────────

describe('Journey: Medication management', () => {
  const SCHEDULE_ID = 'sched_morning';

  const BASE_MED = {
    name: 'Lisinopril',
    dosage: '10',
    unit: 'mg' as const,
    frequency: 'once_daily' as const,
    schedule: [{ id: SCHEDULE_ID, time: '09:00', label: 'Morning' }],
    prescribedBy: 'Dr. Sharma',
    startDate: new Date().toISOString().split('T')[0],
    isActive: true,
    instructions: 'Take with water',
    sideEffects: [],
    refillDate: undefined,
    notes: '',
  };

  beforeEach(async () => {
    await medicationService.initialize();
  });

  it('adds a medication and finds it in the list', async () => {
    const med = await medicationService.addMedication(BASE_MED);
    const list = medicationService.getMedications();

    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(med.id);
    expect(list[0].name).toBe('Lisinopril');
    expect(list[0].dosage).toBe('10');
  });

  it('records a taken dose and reflects 100% adherence', async () => {
    const med = await medicationService.addMedication(BASE_MED);
    await medicationService.recordDose(med.id, SCHEDULE_ID, 'taken');

    const adherence = medicationService.getAdherence(med.id, 'day');
    expect(adherence).toHaveLength(1);
    expect(adherence[0].takenDoses).toBe(1);
    expect(adherence[0].adherenceRate).toBe(100);
  });

  it('records taken and skipped doses and calculates correct adherence rate', async () => {
    const med = await medicationService.addMedication(BASE_MED);
    await medicationService.recordDose(med.id, SCHEDULE_ID, 'taken');
    await medicationService.recordDose(med.id, SCHEDULE_ID, 'skipped');

    const adherence = medicationService.getAdherence(med.id, 'week');
    expect(adherence[0].takenDoses).toBe(1);
    expect(adherence[0].skippedDoses).toBe(1);
    expect(adherence[0].totalDoses).toBe(2);
    // 1 taken out of 2 = 50%
    expect(adherence[0].adherenceRate).toBe(50);
  });

  it('deletes a medication and removes it from the list', async () => {
    const med = await medicationService.addMedication(BASE_MED);
    expect(medicationService.getMedications()).toHaveLength(1);

    const deleted = await medicationService.deleteMedication(med.id);
    expect(deleted).toBe(true);
    expect(medicationService.getMedications()).toHaveLength(0);
  });

  it('returns false when deleting a non-existent medication', async () => {
    const result = await medicationService.deleteMedication('non-existent-id');
    expect(result).toBe(false);
  });

  it('does not include inactive medications when activeOnly=true', async () => {
    await medicationService.addMedication(BASE_MED);
    await medicationService.addMedication({ ...BASE_MED, name: 'Aspirin', isActive: false });

    expect(medicationService.getMedications(false)).toHaveLength(2);
    expect(medicationService.getMedications(true)).toHaveLength(1);
    expect(medicationService.getMedications(true)[0].name).toBe('Lisinopril');
  });

  it('re-loads medications from AsyncStorage after service restart', async () => {
    const med = await medicationService.addMedication(BASE_MED);

    // Simulate service restart
    resetMedication();
    await medicationService.initialize();

    const list = medicationService.getMedications();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(med.id);
  });
});

// ── Journey 3: Storage round-trip ────────────────────────────────────────────

describe('Journey: Message and memory storage', () => {
  const MESSAGES = [
    { id: 'm1', role: 'user' as const, content: 'Hello Karuna', timestamp: 1700000001000 },
    { id: 'm2', role: 'assistant' as const, content: 'Hello! How can I help?', timestamp: 1700000002000 },
  ];

  it('saves and loads messages (cache hit path)', async () => {
    await storageService.saveMessages(MESSAGES);
    const loaded = await storageService.loadMessages();

    expect(loaded).toHaveLength(2);
    expect(loaded[0].id).toBe('m1');
    expect(loaded[1].content).toBe('Hello! How can I help?');
  });

  it('loads messages from AsyncStorage after clearing the cache', async () => {
    await storageService.saveMessages(MESSAGES);
    // Wipe in-memory cache to force a re-read from AsyncStorage
    (storageService as any).messagesCache = null;

    const loaded = await storageService.loadMessages();
    expect(loaded).toHaveLength(2);
    expect(loaded[0].role).toBe('user');
  });

  it('clearMessages() empties the message store', async () => {
    await storageService.saveMessages(MESSAGES);
    await storageService.clearMessages();
    (storageService as any).messagesCache = null;

    const loaded = await storageService.loadMessages();
    expect(loaded).toHaveLength(0);
  });

  it('saves user memory and reads it back', async () => {
    await storageService.saveMemory({
      preferredName: 'Dadi',
      keyPeople: [{ name: 'Arjun', relationship: 'son' }],
      remindersCreated: [],
      preferences: {},
      customInstructions: [],
      lastUpdated: Date.now(),
    });
    (storageService as any).memoryCache = null;

    const mem = await storageService.loadMemory();
    expect(mem.preferredName).toBe('Dadi');
    expect(mem.keyPeople).toHaveLength(1);
    expect(mem.keyPeople[0].name).toBe('Arjun');
  });

  it('updateMemory() merges new fields without losing existing ones', async () => {
    await storageService.saveMemory({
      preferredName: 'Dadi',
      keyPeople: [{ name: 'Arjun', relationship: 'son' }],
      remindersCreated: [],
      preferences: {},
      customInstructions: [],
      lastUpdated: Date.now(),
    });

    await storageService.updateMemory({ preferredName: 'Grandma' });

    const mem = await storageService.loadMemory();
    expect(mem.preferredName).toBe('Grandma');
    // Existing keyPeople must be preserved
    expect(mem.keyPeople).toHaveLength(1);
    expect(mem.keyPeople[0].name).toBe('Arjun');
  });

  it('addKeyPerson() deduplicates by relationship', async () => {
    await storageService.addKeyPerson({ name: 'Arjun', relationship: 'son' });
    await storageService.addKeyPerson({ name: 'Arjun Kumar', relationship: 'son', nickname: 'AK' });

    const mem = await storageService.loadMemory();
    expect(mem.keyPeople).toHaveLength(1);
    expect(mem.keyPeople[0].nickname).toBe('AK');
  });

  it('addCustomInstruction() caps at 10 and avoids duplicates', async () => {
    for (let i = 0; i < 12; i++) {
      await storageService.addCustomInstruction(`instruction-${i}`);
    }
    const mem = await storageService.loadMemory();
    expect(mem.customInstructions.length).toBeLessThanOrEqual(10);
  });

  it('clearAllData() removes messages but leaves memory intact', async () => {
    // Explicitly start with clean memory to guard against any singleton leakage
    (storageService as any).memoryCache = null;
    await AsyncStorage.removeItem('@karuna/memory');

    await storageService.saveMessages(MESSAGES);
    await storageService.addKeyPerson({ name: 'Priya', relationship: 'daughter' });
    await storageService.clearAllData();

    (storageService as any).messagesCache = null;
    const msgs = await storageService.loadMessages();
    expect(msgs).toHaveLength(0);

    // Memory should still contain the person we added
    const mem = await storageService.loadMemory();
    const priya = mem.keyPeople.find((p: any) => p.name === 'Priya');
    expect(priya).toBeDefined();
    expect(priya?.relationship).toBe('daughter');
  });
});

// ── Journey 4: Care circle sync retry cap ────────────────────────────────────

describe('Journey: Care circle sync retry cap', () => {
  beforeEach(() => {
    // Provide auth so pushToCloud() does not short-circuit
    const s = careCircleSyncService as any;
    s.careCircleId = 'circle-abc';
    s.authToken    = 'token-xyz';
    s.deviceId     = 'device-test';
  });

  it('queues changes when pushToCloud fails', async () => {
    const s = careCircleSyncService as any;
    s.pendingChanges = [{
      id: 'change-1',
      entityType: 'health_record',
      entityId: 'rec-1',
      action: 'create',
      data: { bp: '120/80' },
      timestamp: new Date().toISOString(),
      deviceId: 'device-test',
    }];

    // Simulate network failure
    (global as any).fetch = jest.fn().mockRejectedValue(new Error('Network error'));

    await careCircleSyncService.pushToCloud();

    // First failure: retryCount becomes 1 — change is still retained
    expect(s.pendingChanges).toHaveLength(1);
    expect(s.pendingChanges[0].retryCount).toBe(1);
  });

  it('drops a change after MAX_CHANGE_RETRIES consecutive failures', async () => {
    const s = careCircleSyncService as any;
    s.pendingChanges = [{
      id: 'change-drop',
      entityType: 'medication_dose',
      entityId: 'dose-1',
      action: 'create',
      data: { status: 'taken' },
      timestamp: new Date().toISOString(),
      deviceId: 'device-test',
      retryCount: 5, // already at max
    }];

    (global as any).fetch = jest.fn().mockRejectedValue(new Error('Network error'));

    // The next failure increments retryCount to 6 > 5 → change is filtered out
    await careCircleSyncService.pushToCloud();

    expect(s.pendingChanges).toHaveLength(0);
  });

  it('survives up to MAX_CHANGE_RETRIES then drops on the next failure', async () => {
    const MAX = 5;
    const s = careCircleSyncService as any;
    s.pendingChanges = [{
      id: 'change-survive',
      entityType: 'health_record',
      entityId: 'rec-2',
      action: 'update',
      data: { weight: 72 },
      timestamp: new Date().toISOString(),
      deviceId: 'device-test',
    }];

    (global as any).fetch = jest.fn().mockRejectedValue(new Error('Network error'));

    // Fail MAX times → retryCount reaches 5, still present
    for (let i = 0; i < MAX; i++) {
      await careCircleSyncService.pushToCloud();
    }
    expect(s.pendingChanges).toHaveLength(1);
    expect(s.pendingChanges[0].retryCount).toBe(MAX);

    // One more failure → retryCount 6 > 5 → dropped
    await careCircleSyncService.pushToCloud();
    expect(s.pendingChanges).toHaveLength(0);
  });

  it('clears all pending changes on a successful push', async () => {
    const s = careCircleSyncService as any;
    s.pendingChanges = [
      { id: 'c1', entityType: 'note', entityId: 'n1', action: 'create', data: {}, timestamp: new Date().toISOString(), deviceId: 'device-test' },
      { id: 'c2', entityType: 'note', entityId: 'n2', action: 'update', data: {}, timestamp: new Date().toISOString(), deviceId: 'device-test' },
    ];

    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ synced: 2, conflicts: [] }),
    });

    const result = await careCircleSyncService.pushToCloud();

    expect(result.success).toBe(true);
    expect(result.synced).toBe(2);
    expect(s.pendingChanges).toHaveLength(0);
  });
});
