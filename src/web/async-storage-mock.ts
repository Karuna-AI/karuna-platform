/**
 * Web mock for @react-native-async-storage/async-storage
 * Uses localStorage as the underlying storage mechanism
 */

const AsyncStorageMock = {
  /**
   * Fetches item from localStorage
   */
  getItem: async (key: string): Promise<string | null> => {
    try {
      const value = localStorage.getItem(key);
      return value;
    } catch (error) {
      console.error('AsyncStorage getItem error:', error);
      return null;
    }
  },

  /**
   * Sets item in localStorage
   */
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      console.error('AsyncStorage setItem error:', error);
      throw error;
    }
  },

  /**
   * Removes item from localStorage
   */
  removeItem: async (key: string): Promise<void> => {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.error('AsyncStorage removeItem error:', error);
      throw error;
    }
  },

  /**
   * Merges value with existing item
   */
  mergeItem: async (key: string, value: string): Promise<void> => {
    try {
      const existingValue = localStorage.getItem(key);
      if (existingValue) {
        const existingObject = JSON.parse(existingValue);
        const newObject = JSON.parse(value);
        const mergedObject = { ...existingObject, ...newObject };
        localStorage.setItem(key, JSON.stringify(mergedObject));
      } else {
        localStorage.setItem(key, value);
      }
    } catch (error) {
      console.error('AsyncStorage mergeItem error:', error);
      throw error;
    }
  },

  /**
   * Clears all data from localStorage
   */
  clear: async (): Promise<void> => {
    try {
      // Only clear karuna-related keys
      const keys = Object.keys(localStorage).filter((k) => k.startsWith('@karuna'));
      keys.forEach((k) => localStorage.removeItem(k));
    } catch (error) {
      console.error('AsyncStorage clear error:', error);
      throw error;
    }
  },

  /**
   * Gets all keys from localStorage
   */
  getAllKeys: async (): Promise<readonly string[]> => {
    try {
      return Object.keys(localStorage).filter((k) => k.startsWith('@karuna'));
    } catch (error) {
      console.error('AsyncStorage getAllKeys error:', error);
      return [];
    }
  },

  /**
   * Fetches multiple items at once
   */
  multiGet: async (keys: readonly string[]): Promise<readonly [string, string | null][]> => {
    try {
      return keys.map((key) => [key, localStorage.getItem(key)]);
    } catch (error) {
      console.error('AsyncStorage multiGet error:', error);
      return keys.map((key) => [key, null]);
    }
  },

  /**
   * Sets multiple items at once
   */
  multiSet: async (keyValuePairs: readonly [string, string][]): Promise<void> => {
    try {
      keyValuePairs.forEach(([key, value]) => {
        localStorage.setItem(key, value);
      });
    } catch (error) {
      console.error('AsyncStorage multiSet error:', error);
      throw error;
    }
  },

  /**
   * Removes multiple items at once
   */
  multiRemove: async (keys: readonly string[]): Promise<void> => {
    try {
      keys.forEach((key) => {
        localStorage.removeItem(key);
      });
    } catch (error) {
      console.error('AsyncStorage multiRemove error:', error);
      throw error;
    }
  },

  /**
   * Merges multiple items
   */
  multiMerge: async (keyValuePairs: readonly [string, string][]): Promise<void> => {
    try {
      for (const [key, value] of keyValuePairs) {
        await AsyncStorageMock.mergeItem(key, value);
      }
    } catch (error) {
      console.error('AsyncStorage multiMerge error:', error);
      throw error;
    }
  },
};

export default AsyncStorageMock;
