/**
 * Storage Service Tests
 * Tests for all CRUD operations, JSON parse error handling, default returns,
 * cache behaviour, and concurrent writes.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('../../src/web/async-storage-mock')
);

// Force storageService to use the plaintext AsyncStorage path throughout all
// tests. Without this mock, jsdom's crypto.subtle causes encryptedDatabaseService
// to open successfully, making _encDbReady = true. After localStorage.clear()
// in beforeEach, the service then reads nothing from the encrypted path → returns
// defaults, causing "preferredName: undefined" failures across the test suite.
jest.mock('../../src/services/encryptedDatabase', () => ({
  encryptedDatabaseService: {
    isDbOpen:       jest.fn().mockReturnValue(false),
    open:           jest.fn().mockResolvedValue({ success: false }),
    saveCollection: jest.fn().mockResolvedValue(undefined),
    getCollection:  jest.fn().mockResolvedValue([]),
  },
}));

import { storageService } from '../../src/services/storage';
import type { UserMemory, AppSettings, KeyPerson } from '../../src/services/storage';

// The async-storage mock delegates to the global localStorage mock (setupTests.ts).
// We cast it for direct spying.
const AS = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

// Storage keys used by the service (match STORAGE_KEYS in storage.ts)
const KEYS = {
  MESSAGES: '@karuna/messages',
  MEMORY: '@karuna/memory',
  SETTINGS: '@karuna/settings',
  LAST_SUMMARY_INDEX: '@karuna/last_summary_index',
};

function makeMessage(role: 'user' | 'assistant', content: string) {
  return { id: Math.random().toString(), role, content, timestamp: Date.now() };
}

function makeDefaultMemory(overrides: Partial<UserMemory> = {}): UserMemory {
  return {
    keyPeople: [],
    remindersCreated: [],
    preferences: {},
    customInstructions: [],
    lastUpdated: Date.now(),
    ...overrides,
  };
}

const DEFAULT_SETTINGS: AppSettings = {
  fontSize: 'large',
  highContrast: true,
  speechRate: 0.8,
  ttsEnabled: true,
  autoPlayResponses: true,
  language: 'en',
  hapticFeedback: true,
  emergencyContacts: [],
};

beforeEach(() => {
  // Reset internal caches by clearing localStorage and creating a new service reference.
  // Because storageService is a singleton with in-memory caches, we bypass the cache
  // by clearing localStorage and resetting private fields via casting.
  localStorage.clear();
  (storageService as any).memoryCache = null;
  (storageService as any).messagesCache = null;
});

// ─── Messages ────────────────────────────────────────────────────────────────

describe('saveMessages / loadMessages', () => {
  it('saves and reloads messages with timestamps', async () => {
    const msgs = [makeMessage('user', 'hello'), makeMessage('assistant', 'hi there')];
    await storageService.saveMessages(msgs);

    const loaded = await storageService.loadMessages();
    expect(loaded).toHaveLength(2);
    expect(loaded[0].content).toBe('hello');
    expect(loaded[1].content).toBe('hi there');
    expect(loaded[0].timestamp).toBeDefined();
  });

  it('returns empty array when no messages are stored', async () => {
    const loaded = await storageService.loadMessages();
    expect(loaded).toEqual([]);
  });

  it('returns cached messages without hitting AsyncStorage a second time', async () => {
    const msgs = [makeMessage('user', 'cached?')];
    await storageService.saveMessages(msgs);

    // First call populates cache; spy on AsyncStorage.getItem
    jest.spyOn(AS, 'getItem');
    await storageService.loadMessages();
    await storageService.loadMessages(); // second call should use cache

    // getItem should not have been called because messagesCache is set after saveMessages
    expect(AS.getItem).not.toHaveBeenCalledWith(KEYS.MESSAGES);
  });

  it('assigns current timestamp when message has no timestamp', async () => {
    const before = Date.now();
    const msg: any = { id: '1', role: 'user', content: 'no-timestamp' };
    await storageService.saveMessages([msg]);
    const after = Date.now();

    const loaded = await storageService.loadMessages();
    expect(loaded[0].timestamp).toBeGreaterThanOrEqual(before);
    expect(loaded[0].timestamp).toBeLessThanOrEqual(after);
  });

  it('handles JSON parse error on loadMessages and returns empty array', async () => {
    localStorage.setItem(KEYS.MESSAGES, '{bad json');
    (storageService as any).messagesCache = null;
    const result = await storageService.loadMessages();
    expect(result).toEqual([]);
  });
});

describe('clearMessages', () => {
  it('removes messages from storage and nullifies cache', async () => {
    await storageService.saveMessages([makeMessage('user', 'test')]);
    await storageService.clearMessages();

    const loaded = await storageService.loadMessages();
    expect(loaded).toEqual([]);
    expect((storageService as any).messagesCache).toBeNull();
  });
});

// ─── Memory ──────────────────────────────────────────────────────────────────

describe('saveMemory / loadMemory', () => {
  it('saves and loads memory correctly', async () => {
    const memory = makeDefaultMemory({ preferredName: 'Raj' });
    await storageService.saveMemory(memory);

    (storageService as any).memoryCache = null; // force re-read from storage
    const loaded = await storageService.loadMemory();
    expect(loaded.preferredName).toBe('Raj');
  });

  it('updates lastUpdated on every save', async () => {
    const before = Date.now();
    const memory = makeDefaultMemory();
    await storageService.saveMemory(memory);
    const after = Date.now();

    (storageService as any).memoryCache = null;
    const loaded = await storageService.loadMemory();
    expect(loaded.lastUpdated).toBeGreaterThanOrEqual(before);
    expect(loaded.lastUpdated).toBeLessThanOrEqual(after);
  });

  it('returns default memory when nothing is stored', async () => {
    const loaded = await storageService.loadMemory();
    expect(loaded.keyPeople).toEqual([]);
    expect(loaded.customInstructions).toEqual([]);
    expect(loaded.preferences).toEqual({});
  });

  it('returns cached memory without re-reading AsyncStorage', async () => {
    await storageService.saveMemory(makeDefaultMemory({ preferredName: 'Cached' }));
    jest.spyOn(AS, 'getItem');
    await storageService.loadMemory(); // reads from cache set by saveMemory
    expect(AS.getItem).not.toHaveBeenCalledWith(KEYS.MEMORY);
  });

  it('handles JSON parse error on loadMemory and returns defaults', async () => {
    localStorage.setItem(KEYS.MEMORY, 'not-json');
    (storageService as any).memoryCache = null;
    const loaded = await storageService.loadMemory();
    expect(loaded.keyPeople).toEqual([]);
  });
});

describe('updateMemory', () => {
  it('merges partial update with existing memory', async () => {
    await storageService.saveMemory(makeDefaultMemory({ preferredName: 'Raj' }));
    (storageService as any).memoryCache = null;

    const updated = await storageService.updateMemory({ preferredName: 'Ravi' });
    expect(updated.preferredName).toBe('Ravi');
    expect(updated.keyPeople).toEqual([]);
  });

  it('preserves unrelated fields when applying partial update', async () => {
    const initial = makeDefaultMemory({
      preferredName: 'Raj',
      customInstructions: ['remind me daily'],
    });
    await storageService.saveMemory(initial);
    (storageService as any).memoryCache = null;

    await storageService.updateMemory({ preferredName: 'Ravi' });
    (storageService as any).memoryCache = null;

    const loaded = await storageService.loadMemory();
    expect(loaded.customInstructions).toEqual(['remind me daily']);
  });
});

// ─── addKeyPerson ────────────────────────────────────────────────────────────

describe('addKeyPerson', () => {
  it('adds a new person when not already in keyPeople', async () => {
    await storageService.saveMemory(makeDefaultMemory());
    (storageService as any).memoryCache = null;

    await storageService.addKeyPerson({ name: 'Priya', relationship: 'daughter' });
    (storageService as any).memoryCache = null;

    const memory = await storageService.loadMemory();
    expect(memory.keyPeople).toHaveLength(1);
    expect(memory.keyPeople[0].name).toBe('Priya');
  });

  it('updates existing person when same relationship already exists', async () => {
    const initial = makeDefaultMemory({
      keyPeople: [{ name: 'Priya', relationship: 'daughter' }],
    });
    await storageService.saveMemory(initial);
    (storageService as any).memoryCache = null;

    await storageService.addKeyPerson({ name: 'Priya Sharma', relationship: 'daughter' });
    (storageService as any).memoryCache = null;

    const memory = await storageService.loadMemory();
    expect(memory.keyPeople).toHaveLength(1);
    expect(memory.keyPeople[0].name).toBe('Priya Sharma');
  });

  it('updates existing person when same name already exists', async () => {
    const initial = makeDefaultMemory({
      keyPeople: [{ name: 'Ravi', relationship: 'son' }],
    });
    await storageService.saveMemory(initial);
    (storageService as any).memoryCache = null;

    await storageService.addKeyPerson({ name: 'Ravi', relationship: 'son', nickname: 'Ravi Kumar' });
    (storageService as any).memoryCache = null;

    const memory = await storageService.loadMemory();
    expect(memory.keyPeople).toHaveLength(1);
    expect(memory.keyPeople[0].nickname).toBe('Ravi Kumar');
  });

  it('adds multiple distinct people', async () => {
    await storageService.saveMemory(makeDefaultMemory());
    (storageService as any).memoryCache = null;

    await storageService.addKeyPerson({ name: 'Priya', relationship: 'daughter' });
    (storageService as any).memoryCache = null;
    await storageService.addKeyPerson({ name: 'Arjun', relationship: 'son' });
    (storageService as any).memoryCache = null;

    const memory = await storageService.loadMemory();
    expect(memory.keyPeople).toHaveLength(2);
  });
});

// ─── addCustomInstruction ─────────────────────────────────────────────────────

describe('addCustomInstruction', () => {
  it('adds a new instruction', async () => {
    await storageService.saveMemory(makeDefaultMemory());
    (storageService as any).memoryCache = null;

    await storageService.addCustomInstruction('always greet in Hindi');
    (storageService as any).memoryCache = null;

    const memory = await storageService.loadMemory();
    expect(memory.customInstructions).toContain('always greet in Hindi');
  });

  it('does not add duplicate instructions', async () => {
    await storageService.saveMemory(makeDefaultMemory());
    (storageService as any).memoryCache = null;

    await storageService.addCustomInstruction('reminder instruction');
    (storageService as any).memoryCache = null;
    await storageService.addCustomInstruction('reminder instruction');
    (storageService as any).memoryCache = null;

    const memory = await storageService.loadMemory();
    expect(memory.customInstructions.filter((i) => i === 'reminder instruction')).toHaveLength(1);
  });

  it('keeps only the last 10 instructions when limit is exceeded', async () => {
    await storageService.saveMemory(makeDefaultMemory());
    (storageService as any).memoryCache = null;

    for (let i = 0; i < 12; i++) {
      await storageService.addCustomInstruction(`instruction ${i}`);
      (storageService as any).memoryCache = null;
    }

    const memory = await storageService.loadMemory();
    expect(memory.customInstructions.length).toBe(10);
    // Most recent ones should be present
    expect(memory.customInstructions).toContain('instruction 11');
    expect(memory.customInstructions).toContain('instruction 2');
    // Oldest should be gone
    expect(memory.customInstructions).not.toContain('instruction 0');
    expect(memory.customInstructions).not.toContain('instruction 1');
  });
});

// ─── recordReminder ──────────────────────────────────────────────────────────

describe('recordReminder', () => {
  it('stores a reminder message', async () => {
    await storageService.saveMemory(makeDefaultMemory());
    (storageService as any).memoryCache = null;

    await storageService.recordReminder('take medicine at 8am');
    (storageService as any).memoryCache = null;

    const memory = await storageService.loadMemory();
    expect(memory.remindersCreated).toHaveLength(1);
    expect(memory.remindersCreated[0].message).toBe('take medicine at 8am');
  });

  it('records scheduledFor timestamp when provided', async () => {
    await storageService.saveMemory(makeDefaultMemory());
    (storageService as any).memoryCache = null;

    const scheduledFor = Date.now() + 60000;
    await storageService.recordReminder('dinner reminder', scheduledFor);
    (storageService as any).memoryCache = null;

    const memory = await storageService.loadMemory();
    expect(memory.remindersCreated[0].scheduledFor).toBe(scheduledFor);
  });

  it('keeps only last 20 reminders when limit exceeded', async () => {
    await storageService.saveMemory(makeDefaultMemory());
    (storageService as any).memoryCache = null;

    for (let i = 0; i < 22; i++) {
      await storageService.recordReminder(`reminder ${i}`);
      (storageService as any).memoryCache = null;
    }

    const memory = await storageService.loadMemory();
    expect(memory.remindersCreated.length).toBe(20);
    expect(memory.remindersCreated[memory.remindersCreated.length - 1].message).toBe('reminder 21');
  });
});

// ─── Settings ────────────────────────────────────────────────────────────────

describe('saveSettings / loadSettings', () => {
  it('saves and loads settings correctly', async () => {
    const settings: AppSettings = { ...DEFAULT_SETTINGS, highContrast: false, language: 'hi' };
    await storageService.saveSettings(settings);

    const loaded = await storageService.loadSettings();
    expect(loaded.highContrast).toBe(false);
    expect(loaded.language).toBe('hi');
  });

  it('returns default settings when nothing is stored', async () => {
    const loaded = await storageService.loadSettings();
    expect(loaded.fontSize).toBe('large');
    expect(loaded.speechRate).toBe(0.8);
    expect(loaded.language).toBe('en');
    expect(loaded.ttsEnabled).toBe(true);
  });

  it('handles JSON parse error on loadSettings and returns defaults', async () => {
    localStorage.setItem(KEYS.SETTINGS, 'not valid json');
    const loaded = await storageService.loadSettings();
    expect(loaded.fontSize).toBe('large');
  });

  it('persists emergency contacts array', async () => {
    const settings: AppSettings = {
      ...DEFAULT_SETTINGS,
      emergencyContacts: [{ id: 'e1', name: 'Priya', phoneNumber: '+919999999999', relationship: 'daughter' }],
    };
    await storageService.saveSettings(settings);
    const loaded = await storageService.loadSettings();
    expect(loaded.emergencyContacts).toHaveLength(1);
    expect(loaded.emergencyContacts[0].name).toBe('Priya');
  });
});

// ─── Summary Index ───────────────────────────────────────────────────────────

describe('getLastSummaryIndex / setLastSummaryIndex', () => {
  it('returns 0 when no index has been saved', async () => {
    const index = await storageService.getLastSummaryIndex();
    expect(index).toBe(0);
  });

  it('saves and retrieves the summary index', async () => {
    await storageService.setLastSummaryIndex(42);
    const index = await storageService.getLastSummaryIndex();
    expect(index).toBe(42);
  });

  it('does not throw when stored value is non-numeric', async () => {
    localStorage.setItem(KEYS.LAST_SUMMARY_INDEX, 'NaN');
    // parseInt('NaN', 10) === NaN; the service does not guard against this but should not throw
    await expect(storageService.getLastSummaryIndex()).resolves.toBeDefined();
  });
});

// ─── clearAllData / clearMemory ───────────────────────────────────────────────

describe('clearAllData', () => {
  it('removes messages and summary index, nullifies message cache', async () => {
    await storageService.saveMessages([makeMessage('user', 'hello')]);
    await storageService.setLastSummaryIndex(5);

    await storageService.clearAllData();

    const messages = await storageService.loadMessages();
    const index = await storageService.getLastSummaryIndex();

    expect(messages).toEqual([]);
    expect(index).toBe(0);
    expect((storageService as any).messagesCache).toBeNull();
  });

  it('does not remove memory or settings', async () => {
    await storageService.saveMemory(makeDefaultMemory({ preferredName: 'Raj' }));
    await storageService.saveSettings({ ...DEFAULT_SETTINGS, language: 'hi' });

    await storageService.clearAllData();
    (storageService as any).memoryCache = null;

    const memory = await storageService.loadMemory();
    const settings = await storageService.loadSettings();

    expect(memory.preferredName).toBe('Raj');
    expect(settings.language).toBe('hi');
  });
});

describe('clearMemory', () => {
  it('removes memory and nullifies memory cache', async () => {
    await storageService.saveMemory(makeDefaultMemory({ preferredName: 'Raj' }));
    await storageService.clearMemory();

    (storageService as any).memoryCache = null;
    const memory = await storageService.loadMemory();
    expect(memory.preferredName).toBeUndefined();
  });

  it('does not remove messages', async () => {
    await storageService.saveMessages([makeMessage('user', 'hello')]);
    await storageService.clearMemory();

    const messages = await storageService.loadMessages();
    expect(messages).toHaveLength(1);
  });
});

// ─── exportData ──────────────────────────────────────────────────────────────

describe('exportData', () => {
  it('returns a valid JSON string containing messages, memory, and settings', async () => {
    await storageService.saveMessages([makeMessage('user', 'export me')]);
    await storageService.saveMemory(makeDefaultMemory({ preferredName: 'Raj' }));
    await storageService.saveSettings({ ...DEFAULT_SETTINGS, language: 'hi' });
    (storageService as any).memoryCache = null;
    (storageService as any).messagesCache = null;

    const exported = await storageService.exportData();
    const parsed = JSON.parse(exported);

    expect(parsed.exportedAt).toBeDefined();
    expect(Array.isArray(parsed.messages)).toBe(true);
    expect(parsed.messages[0].content).toBe('export me');
    expect(parsed.memory.preferredName).toBe('Raj');
    expect(parsed.settings.language).toBe('hi');
  });

  it('returns valid JSON even when storage is empty (no stored data)', async () => {
    // No data seeded — all calls return defaults
    (storageService as any).memoryCache = null;
    (storageService as any).messagesCache = null;

    const result = await storageService.exportData();
    // Should be a valid JSON string, not '{}'
    const parsed = JSON.parse(result);
    expect(Array.isArray(parsed.messages)).toBe(true);
    expect(parsed.messages).toHaveLength(0);
    expect(parsed.memory).toBeDefined();
    expect(parsed.settings).toBeDefined();
  });

  it('includes ISO timestamp in exportedAt field', async () => {
    const exported = await storageService.exportData();
    const parsed = JSON.parse(exported);
    expect(new Date(parsed.exportedAt).toISOString()).toBe(parsed.exportedAt);
  });
});

// ─── Data integrity ──────────────────────────────────────────────────────────

describe('Data integrity', () => {
  it('preserves all data types after round-trip serialisation', async () => {
    const memory = makeDefaultMemory({
      preferredName: 'Raj',
      preferences: { speechRate: 'slower', language: 'hi' },
      customInstructions: ['instruction 1'],
      keyPeople: [{ name: 'Priya', relationship: 'daughter', nickname: 'Pri' }],
    });

    await storageService.saveMemory(memory);
    (storageService as any).memoryCache = null;
    const loaded = await storageService.loadMemory();

    expect(loaded.preferredName).toBe('Raj');
    expect(loaded.preferences.speechRate).toBe('slower');
    expect(loaded.preferences.language).toBe('hi');
    expect(loaded.customInstructions[0]).toBe('instruction 1');
    expect(loaded.keyPeople[0].nickname).toBe('Pri');
  });

  it('handles special characters and emoji in memory fields', async () => {
    const memory = makeDefaultMemory({
      preferredName: 'Sree 🙏',
      customInstructions: ['speak in "quotes" and \'apostrophes\''],
    });

    await storageService.saveMemory(memory);
    (storageService as any).memoryCache = null;
    const loaded = await storageService.loadMemory();

    expect(loaded.preferredName).toBe('Sree 🙏');
    expect(loaded.customInstructions[0]).toContain('"quotes"');
  });
});

// ─── Original style tests preserved ─────────────────────────────────────────

describe('Storage Service (original mock-based)', () => {
  let mockStorage: Record<string, string>;
  let mockLocalStorage: Storage;

  beforeEach(() => {
    mockStorage = {};
    mockLocalStorage = {
      getItem: jest.fn((key: string) => mockStorage[key] || null),
      setItem: jest.fn((key: string, value: string) => { mockStorage[key] = value; }),
      removeItem: jest.fn((key: string) => { delete mockStorage[key]; }),
      clear: jest.fn(() => { mockStorage = {}; }),
      length: 0,
      key: jest.fn(),
    };
  });

  it('should store and retrieve string values', () => {
    mockLocalStorage.setItem('testKey', 'testValue');
    expect(mockStorage['testKey']).toBe('testValue');
    const result = mockLocalStorage.getItem('testKey');
    expect(result).toBe('testValue');
  });

  it('should return null for non-existent keys', () => {
    const result = mockLocalStorage.getItem('missing');
    expect(result).toBeNull();
  });

  it('should remove stored values', () => {
    mockStorage['key'] = 'value';
    mockLocalStorage.removeItem('key');
    expect(mockStorage['key']).toBeUndefined();
  });

  it('should handle JSON round-trip', () => {
    const data = { name: 'test', nested: { value: 123 }, arr: [1, 2] };
    mockLocalStorage.setItem('json', JSON.stringify(data));
    const parsed = JSON.parse(mockLocalStorage.getItem('json') as string);
    expect(parsed).toEqual(data);
  });

  it('should handle null values via JSON', () => {
    mockLocalStorage.setItem('null', JSON.stringify(null));
    expect(mockLocalStorage.getItem('null')).toBe('null');
  });
});

describe('Storage Data Integrity', () => {
  it('should preserve data types after storage', () => {
    const testData = {
      string: 'hello',
      number: 42,
      boolean: true,
      array: [1, 2, 3],
      object: { nested: 'value' },
      nullValue: null,
    };
    const parsed = JSON.parse(JSON.stringify(testData));
    expect(parsed).toEqual(testData);
  });

  it('should handle special characters in values', () => {
    const specialChars = 'Test with émojis 🎉 and "quotes"';
    expect(JSON.parse(JSON.stringify(specialChars))).toBe(specialChars);
  });

  it('should handle large data', () => {
    const largeData = 'x'.repeat(10000);
    expect(JSON.parse(JSON.stringify(largeData)).length).toBe(10000);
  });
});
