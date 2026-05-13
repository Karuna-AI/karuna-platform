import AsyncStorage from '@react-native-async-storage/async-storage';
import { Message } from '../types';
import { LanguageCode } from '../i18n/languages';
import { encryptedDatabaseService } from './encryptedDatabase';

// Storage keys — settings and metadata stay in plain AsyncStorage (non-sensitive).
// Messages and memory are encrypted via encryptedDatabaseService.
const STORAGE_KEYS = {
  MESSAGES: '@karuna/messages',
  MEMORY: '@karuna/memory',
  SETTINGS: '@karuna/settings',
  LAST_SUMMARY_INDEX: '@karuna/last_summary_index',
} as const;

// Encrypted collection names used by encryptedDatabaseService
const ENC_COLLECTION = {
  MESSAGES: 'chat_messages',
  MEMORY: 'user_memory',
} as const;

let _encDbReady: boolean | null = null; // null = not attempted yet

async function _ensureEncryptedDb(): Promise<boolean> {
  if (_encDbReady === true) return true;
  if (_encDbReady === false) return false;
  try {
    if (encryptedDatabaseService.isDbOpen()) {
      _encDbReady = true;
      return true;
    }
    const result = await encryptedDatabaseService.open();
    _encDbReady = result.success;
    if (!result.success) {
      console.warn('[Storage] Encrypted DB unavailable, falling back to plaintext:', result.error);
    }
    return _encDbReady;
  } catch (err) {
    _encDbReady = false;
    console.warn('[Storage] Encrypted DB open error, falling back to plaintext:', err);
    return false;
  }
}

/** Migrate plaintext AsyncStorage key → encrypted DB collection, then delete the old key. */
async function _migrateIfNeeded<T>(storageKey: string, collectionName: string): Promise<void> {
  try {
    const plain = await AsyncStorage.getItem(storageKey);
    if (!plain) return;
    const data: T[] = JSON.parse(plain);
    if (!Array.isArray(data) || data.length === 0) {
      await AsyncStorage.removeItem(storageKey);
      return;
    }
    await encryptedDatabaseService.saveCollection(collectionName, data);
    await AsyncStorage.removeItem(storageKey);
    console.debug(`[Storage] Migrated ${storageKey} → encrypted:${collectionName} (${data.length} items)`);
  } catch (err) {
    console.warn(`[Storage] Migration failed for ${storageKey}:`, err);
  }
}

export interface StoredMessage extends Message {
  timestamp: number;
  model?: string;
  transcriptText?: string;
}

export interface UserMemory {
  preferredName?: string;
  keyPeople: KeyPerson[];
  remindersCreated: ReminderRecord[];
  preferences: UserPreferences;
  customInstructions: string[];
  lastUpdated: number;
}

export interface KeyPerson {
  name: string;
  relationship: string;
  nickname?: string;
  phoneLabel?: string;
}

export interface ReminderRecord {
  message: string;
  createdAt: number;
  scheduledFor?: number;
}

export interface UserPreferences {
  speechRate?: 'slower' | 'normal' | 'faster';
  language?: string;
  voiceGender?: 'male' | 'female';
  fontSize?: 'large' | 'extra-large';
}

export type FontSize = 'small' | 'medium' | 'large' | 'extraLarge';
export type SpeechRate = 0.7 | 0.8 | 0.9 | 1.0;
export type Language = LanguageCode;

export interface EmergencyContact {
  id: string;
  name: string;
  phoneNumber: string;
  relationship?: string;
}

export interface AppSettings {
  // Display
  fontSize: FontSize;
  highContrast: boolean;

  // Voice
  speechRate: SpeechRate;
  voiceId?: string;
  ttsEnabled: boolean;
  autoPlayResponses: boolean;

  // Language
  language: Language;

  // Accessibility
  hapticFeedback: boolean;

  // Emergency
  emergencyContacts: EmergencyContact[];
  primaryEmergencyContact?: string;
}

const DEFAULT_MEMORY: UserMemory = {
  keyPeople: [],
  remindersCreated: [],
  preferences: {},
  customInstructions: [],
  lastUpdated: Date.now(),
};

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

/**
 * Storage service for persisting chat history and user memory
 */
class StorageService {
  private memoryCache: UserMemory | null = null;
  private messagesCache: StoredMessage[] | null = null;

  /**
   * Save messages to encrypted storage (falls back to AsyncStorage if encryption unavailable).
   */
  async saveMessages(messages: Message[]): Promise<void> {
    try {
      const storedMessages: StoredMessage[] = messages.map((msg) => ({
        ...msg,
        timestamp: msg.timestamp || Date.now(),
      }));

      const enc = await _ensureEncryptedDb();
      if (enc) {
        await encryptedDatabaseService.saveCollection(ENC_COLLECTION.MESSAGES, storedMessages);
      } else {
        await AsyncStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(storedMessages));
      }
      this.messagesCache = storedMessages;
    } catch (error) {
      console.error('Error saving messages:', error);
    }
  }

  /**
   * Load messages from encrypted storage, migrating plaintext data on first read.
   */
  async loadMessages(): Promise<StoredMessage[]> {
    try {
      if (this.messagesCache) {
        return this.messagesCache;
      }

      const enc = await _ensureEncryptedDb();
      if (enc) {
        await _migrateIfNeeded<StoredMessage>(STORAGE_KEYS.MESSAGES, ENC_COLLECTION.MESSAGES);
        const messages = await encryptedDatabaseService.getCollection<StoredMessage>(ENC_COLLECTION.MESSAGES);
        this.messagesCache = messages;
        return messages;
      }

      // Fallback: plaintext AsyncStorage
      const data = await AsyncStorage.getItem(STORAGE_KEYS.MESSAGES);
      if (data) {
        const messages = JSON.parse(data) as StoredMessage[];
        this.messagesCache = messages;
        return messages;
      }
      return [];
    } catch (error) {
      console.error('Error loading messages:', error);
      return [];
    }
  }

  /**
   * Clear all messages from encrypted storage.
   */
  async clearMessages(): Promise<void> {
    try {
      const enc = await _ensureEncryptedDb();
      if (enc) {
        await encryptedDatabaseService.saveCollection(ENC_COLLECTION.MESSAGES, []);
      }
      // Always remove the plaintext key in case it still exists from before migration
      await AsyncStorage.removeItem(STORAGE_KEYS.MESSAGES);
      this.messagesCache = null;
    } catch (error) {
      console.error('Error clearing messages:', error);
    }
  }

  /**
   * Save user memory to encrypted storage.
   */
  async saveMemory(memory: UserMemory): Promise<void> {
    try {
      memory.lastUpdated = Date.now();
      const enc = await _ensureEncryptedDb();
      if (enc) {
        // Store memory as a single-element collection
        await encryptedDatabaseService.saveCollection(ENC_COLLECTION.MEMORY, [memory]);
      } else {
        await AsyncStorage.setItem(STORAGE_KEYS.MEMORY, JSON.stringify(memory));
      }
      this.memoryCache = memory;
    } catch (error) {
      console.error('Error saving memory:', error);
    }
  }

  /**
   * Load user memory from encrypted storage, migrating plaintext data on first read.
   */
  async loadMemory(): Promise<UserMemory> {
    try {
      if (this.memoryCache) {
        return this.memoryCache;
      }

      const enc = await _ensureEncryptedDb();
      if (enc) {
        // Migrate plaintext memory (stored as a plain object, not an array) if present
        const plainRaw = await AsyncStorage.getItem(STORAGE_KEYS.MEMORY);
        if (plainRaw) {
          const plainMemory = JSON.parse(plainRaw) as UserMemory;
          await encryptedDatabaseService.saveCollection(ENC_COLLECTION.MEMORY, [plainMemory]);
          await AsyncStorage.removeItem(STORAGE_KEYS.MEMORY);
          console.debug('[Storage] Migrated @karuna/memory → encrypted:user_memory');
        }
        const items = await encryptedDatabaseService.getCollection<UserMemory>(ENC_COLLECTION.MEMORY);
        const memory = items.length > 0 ? items[0] : { ...DEFAULT_MEMORY };
        this.memoryCache = memory;
        return memory;
      }

      // Fallback: plaintext AsyncStorage
      const data = await AsyncStorage.getItem(STORAGE_KEYS.MEMORY);
      if (data) {
        const memory = JSON.parse(data) as UserMemory;
        this.memoryCache = memory;
        return memory;
      }
      return { ...DEFAULT_MEMORY };
    } catch (error) {
      console.error('Error loading memory:', error);
      return { ...DEFAULT_MEMORY };
    }
  }

  /**
   * Update specific memory fields
   */
  async updateMemory(updates: Partial<UserMemory>): Promise<UserMemory> {
    const current = await this.loadMemory();
    const updated: UserMemory = {
      ...current,
      ...updates,
      lastUpdated: Date.now(),
    };
    await this.saveMemory(updated);
    return updated;
  }

  /**
   * Add a key person to memory
   */
  async addKeyPerson(person: KeyPerson): Promise<void> {
    const memory = await this.loadMemory();

    // Check if person already exists (by relationship or name)
    const existingIndex = memory.keyPeople.findIndex(
      (p) =>
        p.relationship.toLowerCase() === person.relationship.toLowerCase() ||
        p.name.toLowerCase() === person.name.toLowerCase()
    );

    if (existingIndex >= 0) {
      // Update existing
      memory.keyPeople[existingIndex] = {
        ...memory.keyPeople[existingIndex],
        ...person,
      };
    } else {
      // Add new
      memory.keyPeople.push(person);
    }

    await this.saveMemory(memory);
  }

  /**
   * Add a custom instruction
   */
  async addCustomInstruction(instruction: string): Promise<void> {
    const memory = await this.loadMemory();

    // Avoid duplicates
    if (!memory.customInstructions.includes(instruction)) {
      memory.customInstructions.push(instruction);
      // Keep only last 10 instructions
      if (memory.customInstructions.length > 10) {
        memory.customInstructions = memory.customInstructions.slice(-10);
      }
      await this.saveMemory(memory);
    }
  }

  /**
   * Record a reminder that was created
   */
  async recordReminder(message: string, scheduledFor?: number): Promise<void> {
    const memory = await this.loadMemory();
    memory.remindersCreated.push({
      message,
      createdAt: Date.now(),
      scheduledFor,
    });

    // Keep only last 20 reminders
    if (memory.remindersCreated.length > 20) {
      memory.remindersCreated = memory.remindersCreated.slice(-20);
    }

    await this.saveMemory(memory);
  }

  /**
   * Save app settings
   */
  async saveSettings(settings: AppSettings): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    } catch (error) {
      console.error('Error saving settings:', error);
    }
  }

  /**
   * Load app settings
   */
  async loadSettings(): Promise<AppSettings> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (data) {
        return JSON.parse(data) as AppSettings;
      }
      return { ...DEFAULT_SETTINGS };
    } catch (error) {
      console.error('Error loading settings:', error);
      return { ...DEFAULT_SETTINGS };
    }
  }

  /**
   * Get last summary index (for tracking when to generate summaries)
   */
  async getLastSummaryIndex(): Promise<number> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.LAST_SUMMARY_INDEX);
      return data ? parseInt(data, 10) : 0;
    } catch {
      return 0;
    }
  }

  /**
   * Set last summary index
   */
  async setLastSummaryIndex(index: number): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.LAST_SUMMARY_INDEX, index.toString());
    } catch (error) {
      console.error('Error saving summary index:', error);
    }
  }

  /**
   * Clear all data (for "Clear history" feature)
   */
  async clearAllData(): Promise<void> {
    try {
      const enc = await _ensureEncryptedDb();
      if (enc) {
        await encryptedDatabaseService.saveCollection(ENC_COLLECTION.MESSAGES, []);
      }
      await AsyncStorage.multiRemove([
        STORAGE_KEYS.MESSAGES,
        STORAGE_KEYS.LAST_SUMMARY_INDEX,
      ]);
      this.messagesCache = null;
    } catch (error) {
      console.error('Error clearing data:', error);
    }
  }

  /**
   * Clear memory but keep messages
   */
  async clearMemory(): Promise<void> {
    try {
      const enc = await _ensureEncryptedDb();
      if (enc) {
        await encryptedDatabaseService.saveCollection(ENC_COLLECTION.MEMORY, []);
      }
      await AsyncStorage.removeItem(STORAGE_KEYS.MEMORY);
      this.memoryCache = null;
    } catch (error) {
      console.error('Error clearing memory:', error);
    }
  }

  /**
   * Export all data for caregiver
   */
  async exportData(): Promise<string> {
    try {
      const messages = await this.loadMessages();
      const memory = await this.loadMemory();
      const settings = await this.loadSettings();

      const exportData = {
        exportedAt: new Date().toISOString(),
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
          timestamp: new Date(m.timestamp).toISOString(),
        })),
        memory,
        settings,
      };

      return JSON.stringify(exportData, null, 2);
    } catch (error) {
      console.error('Error exporting data:', error);
      return '{}';
    }
  }
}

export const storageService = new StorageService();
export default storageService;
