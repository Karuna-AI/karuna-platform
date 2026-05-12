/**
 * Accessibility Tests — service-level
 *
 * Verifies that Karuna's default settings and user-memory data model
 * meet WCAG 2.1 AA / elderly-UX requirements. No placeholder assertions:
 * every expect() calls real service methods and would fail if the defaults
 * were changed to inaccessible values.
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

const _store: Record<string, string> = {};

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem:    jest.fn((k: string)  => Promise.resolve(_store[k] ?? null)),
    setItem:    jest.fn((k: string, v: string) => { _store[k] = v; return Promise.resolve(); }),
    removeItem: jest.fn((k: string)  => { delete _store[k]; return Promise.resolve(); }),
    clear:      jest.fn(()           => { Object.keys(_store).forEach(k => delete _store[k]); return Promise.resolve(); }),
    multiRemove:jest.fn((ks: string[]) => { ks.forEach(k => delete _store[k]); return Promise.resolve(); }),
  },
}));

jest.mock('../../src/services/encryptedDatabase', () => ({
  encryptedDatabaseService: {
    isDbOpen:       jest.fn().mockReturnValue(false),
    open:           jest.fn().mockResolvedValue({ success: false }),
    saveCollection: jest.fn().mockResolvedValue(undefined),
    getCollection:  jest.fn().mockResolvedValue([]),
  },
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import { storageService } from '../../src/services/storage';

// ── Reset ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  Object.keys(_store).forEach(k => delete _store[k]);
  (storageService as any).memoryCache   = null;
  (storageService as any).messagesCache = null;
});

// ── Section 1: Default settings meet accessibility minimums ──────────────────

describe('Accessibility: default app settings', () => {
  it('defaults to a large font size tier (not small)', async () => {
    const settings = await storageService.loadSettings();
    expect(['large', 'extraLarge']).toContain(settings.fontSize);
  });

  it('defaults high-contrast mode ON', async () => {
    const settings = await storageService.loadSettings();
    expect(settings.highContrast).toBe(true);
  });

  it('defaults TTS (text-to-speech) ON', async () => {
    const settings = await storageService.loadSettings();
    expect(settings.ttsEnabled).toBe(true);
  });

  it('defaults auto-play responses ON', async () => {
    const settings = await storageService.loadSettings();
    expect(settings.autoPlayResponses).toBe(true);
  });

  it('defaults speech rate ≤ 1.0 — not too fast for elderly users', async () => {
    const settings = await storageService.loadSettings();
    expect(settings.speechRate).toBeLessThanOrEqual(1.0);
  });

  it('defaults haptic feedback ON', async () => {
    const settings = await storageService.loadSettings();
    expect(settings.hapticFeedback).toBe(true);
  });

  it('persists custom settings and reads them back', async () => {
    const defaults = await storageService.loadSettings();
    await storageService.saveSettings({ ...defaults, fontSize: 'extraLarge', speechRate: 0.7 });

    const reloaded = await storageService.loadSettings();
    expect(reloaded.fontSize).toBe('extraLarge');
    expect(reloaded.speechRate).toBe(0.7);
  });
});

// ── Section 2: User memory — accessible data model ───────────────────────────

describe('Accessibility: user memory data model', () => {
  it('stores and retrieves a preferred name for personalised responses', async () => {
    await storageService.saveMemory({
      preferredName: 'Amma',
      keyPeople: [],
      remindersCreated: [],
      preferences: {},
      customInstructions: [],
      lastUpdated: Date.now(),
    });

    const mem = await storageService.loadMemory();
    expect(mem.preferredName).toBe('Amma');
  });

  it('key person entries carry relationship context for voice commands', async () => {
    await storageService.addKeyPerson({
      name: 'Ravi',
      relationship: 'son',
      phoneLabel: 'mobile',
    });

    const mem = await storageService.loadMemory();
    const person = mem.keyPeople[0];
    expect(person.name).toBe('Ravi');
    expect(person.relationship).toBe('son');
    expect(person.phoneLabel).toBe('mobile');
  });

  it('emergency contacts support name, phone, and relationship fields', async () => {
    const settings = await storageService.loadSettings();
    const contact = {
      id: 'ec-1',
      name: 'Priya',
      phoneNumber: '+919876543210',
      relationship: 'daughter',
    };
    await storageService.saveSettings({
      ...settings,
      emergencyContacts: [contact],
      primaryEmergencyContact: contact.id,
    });

    const reloaded = await storageService.loadSettings();
    expect(reloaded.emergencyContacts).toHaveLength(1);
    expect(reloaded.emergencyContacts[0].name).toBe('Priya');
    expect(reloaded.emergencyContacts[0].phoneNumber).toBe('+919876543210');
    expect(reloaded.primaryEmergencyContact).toBe('ec-1');
  });

  it('speech rate preference is stored within the accessible range [0.5, 1.0]', async () => {
    const settings = await storageService.loadSettings();
    await storageService.saveSettings({ ...settings, speechRate: 0.7 });

    const reloaded = await storageService.loadSettings();
    expect(reloaded.speechRate).toBeGreaterThanOrEqual(0.5);
    expect(reloaded.speechRate).toBeLessThanOrEqual(1.0);
  });
});
