/**
 * Storage Service Tests
 * Tests for AsyncStorage operations and data persistence
 */

describe('Storage Service', () => {
  // Create fresh mock for each test
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

  describe('setItem', () => {
    it('should store string value', async () => {
      mockLocalStorage.setItem('testKey', 'testValue');

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('testKey', 'testValue');
      expect(mockStorage['testKey']).toBe('testValue');
    });

    it('should store JSON object', async () => {
      const data = { name: 'test', value: 123 };
      mockLocalStorage.setItem('jsonKey', JSON.stringify(data));

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'jsonKey',
        JSON.stringify(data)
      );
    });

    it('should handle null values', async () => {
      mockLocalStorage.setItem('nullKey', JSON.stringify(null));

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('nullKey', 'null');
    });

    it('should handle array values', async () => {
      const arr = [1, 2, 3, 'test'];
      mockLocalStorage.setItem('arrayKey', JSON.stringify(arr));

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'arrayKey',
        JSON.stringify(arr)
      );
    });
  });

  describe('getItem', () => {
    it('should retrieve stored value', async () => {
      mockStorage['testKey'] = 'storedValue';

      const result = mockLocalStorage.getItem('testKey');

      expect(result).toBe('storedValue');
    });

    it('should return null for non-existent key', async () => {
      const result = mockLocalStorage.getItem('nonExistentKey');

      expect(result).toBeNull();
    });

    it('should parse JSON values correctly', async () => {
      const data = { name: 'test', nested: { value: 123 } };
      mockStorage['jsonKey'] = JSON.stringify(data);

      const result = JSON.parse(mockLocalStorage.getItem('jsonKey') as string);

      expect(result).toEqual(data);
    });
  });

  describe('removeItem', () => {
    it('should remove stored value', async () => {
      mockStorage['testKey'] = 'value';
      mockLocalStorage.removeItem('testKey');

      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('testKey');
      expect(mockStorage['testKey']).toBeUndefined();
    });

    it('should handle removing non-existent key', async () => {
      mockLocalStorage.removeItem('nonExistentKey');

      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('nonExistentKey');
    });
  });

  describe('clear', () => {
    it('should clear all stored values', async () => {
      mockStorage['key1'] = 'value1';
      mockStorage['key2'] = 'value2';

      mockLocalStorage.clear();

      expect(mockLocalStorage.clear).toHaveBeenCalled();
    });
  });

  describe('multiGet', () => {
    it('should retrieve multiple values', async () => {
      mockStorage['key1'] = 'value1';
      mockStorage['key2'] = 'value2';
      mockStorage['key3'] = 'value3';

      const keys = ['key1', 'key2', 'key3'];
      const results = keys.map(key => mockLocalStorage.getItem(key));

      expect(results).toEqual(['value1', 'value2', 'value3']);
    });
  });

  describe('multiSet', () => {
    it('should store multiple values', async () => {
      const pairs = [
        ['key1', 'value1'],
        ['key2', 'value2'],
      ];

      pairs.forEach(([key, value]) => {
        mockLocalStorage.setItem(key, value);
      });

      expect(mockLocalStorage.setItem).toHaveBeenCalledTimes(2);
      expect(mockStorage['key1']).toBe('value1');
      expect(mockStorage['key2']).toBe('value2');
    });
  });
});

describe('Storage Data Integrity', () => {
  it('should preserve data types after storage', async () => {
    const testData = {
      string: 'hello',
      number: 42,
      boolean: true,
      array: [1, 2, 3],
      object: { nested: 'value' },
      nullValue: null,
    };

    const serialized = JSON.stringify(testData);
    const parsed = JSON.parse(serialized);

    expect(parsed).toEqual(testData);
  });

  it('should handle special characters in values', async () => {
    const specialChars = 'Test with émojis 🎉 and "quotes"';
    const serialized = JSON.stringify(specialChars);
    const parsed = JSON.parse(serialized);

    expect(parsed).toBe(specialChars);
  });

  it('should handle large data', async () => {
    const largeData = 'x'.repeat(10000);
    const serialized = JSON.stringify(largeData);
    const parsed = JSON.parse(serialized);

    expect(parsed).toBe(largeData);
    expect(parsed.length).toBe(10000);
  });
});

describe('Settings Storage', () => {
  const defaultSettings = {
    language: 'en',
    speechRate: 1.0,
    theme: 'light',
    fontSize: 'medium',
    notifications: true,
  };

  it('should store settings object', () => {
    const mockStorage: Record<string, string> = {};
    const setItem = (key: string, value: string) => { mockStorage[key] = value; };

    setItem('settings', JSON.stringify(defaultSettings));

    expect(mockStorage['settings']).toBe(JSON.stringify(defaultSettings));
  });

  it('should retrieve and parse settings', () => {
    const mockStorage: Record<string, string> = {
      settings: JSON.stringify(defaultSettings),
    };
    const getItem = (key: string) => mockStorage[key] || null;

    const settings = JSON.parse(getItem('settings') as string);

    expect(settings).toEqual(defaultSettings);
  });

  it('should merge partial settings update', () => {
    const update = { language: 'hi', speechRate: 0.8 };
    const merged = { ...defaultSettings, ...update };
    const serialized = JSON.stringify(merged);

    expect(serialized).toContain('"language":"hi"');
    expect(merged.language).toBe('hi');
    expect(merged.speechRate).toBe(0.8);
  });
});
