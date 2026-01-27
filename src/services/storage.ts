import AsyncStorage from '@react-native-async-storage/async-storage';
import { Message } from '../types';

// Storage keys
const STORAGE_KEYS = {
  MESSAGES: '@karuna/messages',
  MEMORY: '@karuna/memory',
  SETTINGS: '@karuna/settings',
  LAST_SUMMARY_INDEX: '@karuna/last_summary_index',
} as const;

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
export type Language = 'en' | 'hi' | 'es' | 'zh';

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
   * Save messages to storage
   */
  async saveMessages(messages: Message[]): Promise<void> {
    try {
      const storedMessages: StoredMessage[] = messages.map((msg) => ({
        ...msg,
        timestamp: msg.timestamp || Date.now(),
      }));

      await AsyncStorage.setItem(
        STORAGE_KEYS.MESSAGES,
        JSON.stringify(storedMessages)
      );
      this.messagesCache = storedMessages;
    } catch (error) {
      console.error('Error saving messages:', error);
    }
  }

  /**
   * Load messages from storage
   */
  async loadMessages(): Promise<StoredMessage[]> {
    try {
      if (this.messagesCache) {
        return this.messagesCache;
      }

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
   * Clear all messages
   */
  async clearMessages(): Promise<void> {
    try {
      await AsyncStorage.removeItem(STORAGE_KEYS.MESSAGES);
      this.messagesCache = null;
    } catch (error) {
      console.error('Error clearing messages:', error);
    }
  }

  /**
   * Save user memory
   */
  async saveMemory(memory: UserMemory): Promise<void> {
    try {
      memory.lastUpdated = Date.now();
      await AsyncStorage.setItem(STORAGE_KEYS.MEMORY, JSON.stringify(memory));
      this.memoryCache = memory;
    } catch (error) {
      console.error('Error saving memory:', error);
    }
  }

  /**
   * Load user memory
   */
  async loadMemory(): Promise<UserMemory> {
    try {
      if (this.memoryCache) {
        return this.memoryCache;
      }

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
    } catch (error) {
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
