import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { secureStorageService } from './secureStorage';
import { auditLogService } from './auditLog';

const DB_PREFIX = '@karuna_encrypted_';
const DB_VERSION = 1;

/**
 * Check if Web Crypto API (crypto.subtle) is available.
 * Hermes engine in React Native does NOT support crypto.subtle.
 */
function hasCryptoSubtle(): boolean {
  return typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined' &&
    typeof crypto.subtle.generateKey === 'function';
}

/**
 * Encryption utilities with fallback for environments without crypto.subtle.
 *
 * When crypto.subtle is available (modern browsers), uses AES-GCM.
 * When not available (Hermes/React Native), uses expo-crypto SHA-256 based
 * XOR encryption with a derived key. Data is already sandboxed per-app on
 * mobile, and the key is stored in the system keychain via SecureStore.
 */
class EncryptionUtils {
  private key: CryptoKey | null = null;
  private keyBytes: Uint8Array | null = null;
  private keyString: string | null = null;
  private useWebCrypto: boolean = false;

  async initialize(keyBase64?: string): Promise<boolean> {
    try {
      this.useWebCrypto = hasCryptoSubtle();

      if (keyBase64) {
        this.keyString = keyBase64;
        this.keyBytes = Uint8Array.from(atob(keyBase64), (c) => c.charCodeAt(0));
        if (this.useWebCrypto) {
          this.key = await this.importKey(keyBase64);
        }
      } else {
        // Get or generate key from secure storage
        const result = await secureStorageService.getDatabaseKey();
        if (result.success && result.key) {
          this.keyString = result.key;
          this.keyBytes = Uint8Array.from(atob(result.key), (c) => c.charCodeAt(0));
          if (this.useWebCrypto) {
            this.key = await this.importKey(result.key);
          }
        } else {
          // Generate new key using expo-crypto
          const newKeyBytes = await Crypto.getRandomBytesAsync(32);
          this.keyBytes = new Uint8Array(newKeyBytes);
          this.keyString = btoa(String.fromCharCode(...this.keyBytes));
          if (this.useWebCrypto) {
            this.key = await this.importKey(this.keyString);
          }
          await secureStorageService.storeDatabaseKey(this.keyString);
        }
      }

      if (!this.useWebCrypto) {
        console.debug('[EncryptionUtils] Using expo-crypto fallback (crypto.subtle not available)');
      }

      return true;
    } catch (error) {
      console.error('[EncryptionUtils] Init error:', error);
      return false;
    }
  }

  private async importKey(keyBase64: string): Promise<CryptoKey> {
    const keyData = Uint8Array.from(atob(keyBase64), (c) => c.charCodeAt(0));
    return crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'AES-GCM' },
      true,
      ['encrypt', 'decrypt']
    );
  }

  async encrypt(plaintext: string): Promise<string> {
    if (!this.keyBytes) throw new Error('Encryption not initialized');

    if (this.useWebCrypto && this.key) {
      // Use AES-GCM when available
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encodedText = new TextEncoder().encode(plaintext);
      const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        this.key,
        encodedText
      );
      const combined = new Uint8Array(iv.length + ciphertext.byteLength);
      combined.set(iv, 0);
      combined.set(new Uint8Array(ciphertext), iv.length);
      return btoa(String.fromCharCode(...combined));
    }

    // Fallback: XOR encryption with SHA-256 derived keystream
    const ivBytes = await Crypto.getRandomBytesAsync(16);
    const iv = new Uint8Array(ivBytes);
    const plainBytes = new TextEncoder().encode(plaintext);
    const encrypted = await this.xorEncrypt(plainBytes, iv);

    // Combine IV + encrypted data
    const combined = new Uint8Array(iv.length + encrypted.length);
    combined.set(iv, 0);
    combined.set(encrypted, iv.length);

    return btoa(String.fromCharCode(...combined));
  }

  async decrypt(encryptedBase64: string): Promise<string> {
    if (!this.keyBytes) throw new Error('Encryption not initialized');

    if (this.useWebCrypto && this.key) {
      const combined = Uint8Array.from(atob(encryptedBase64), (c) => c.charCodeAt(0));
      const iv = combined.slice(0, 12);
      const ciphertext = combined.slice(12);
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        this.key,
        ciphertext
      );
      return new TextDecoder().decode(decrypted);
    }

    // Fallback: XOR decryption
    const combined = Uint8Array.from(atob(encryptedBase64), (c) => c.charCodeAt(0));
    const iv = combined.slice(0, 16);
    const cipherBytes = combined.slice(16);
    const decrypted = await this.xorEncrypt(cipherBytes, iv); // XOR is symmetric

    return new TextDecoder().decode(decrypted);
  }

  /**
   * XOR encryption using SHA-256 derived keystream.
   * Same operation for encrypt and decrypt (XOR is symmetric).
   */
  private async xorEncrypt(data: Uint8Array, iv: Uint8Array): Promise<Uint8Array> {
    const result = new Uint8Array(data.length);
    let keystreamOffset = 0;
    let keystream = new Uint8Array(0);
    let blockCounter = 0;

    for (let i = 0; i < data.length; i++) {
      if (keystreamOffset >= keystream.length) {
        // Generate next 32-byte keystream block using SHA-256
        const input = `${this.keyString}:${Array.from(iv).map(b => b.toString(16)).join('')}:${blockCounter}`;
        const hash = await Crypto.digestStringAsync(
          Crypto.CryptoDigestAlgorithm.SHA256,
          input
        );
        keystream = new Uint8Array(32);
        for (let j = 0; j < 32; j++) {
          keystream[j] = parseInt(hash.substring(j * 2, j * 2 + 2), 16);
        }
        keystreamOffset = 0;
        blockCounter++;
      }
      result[i] = data[i] ^ keystream[keystreamOffset++];
    }

    return result;
  }

  isInitialized(): boolean {
    return this.keyBytes !== null;
  }
}

export interface DatabaseCollection<T> {
  name: string;
  data: T[];
  lastModified: string;
  version: number;
}

export interface DatabaseMetadata {
  version: number;
  createdAt: string;
  lastModified: string;
  collections: string[];
  encryptionEnabled: boolean;
}

class EncryptedDatabaseService {
  private encryption: EncryptionUtils;
  private isOpen: boolean = false;
  private metadata: DatabaseMetadata | null = null;

  constructor() {
    this.encryption = new EncryptionUtils();
  }

  /**
   * Open/initialize the encrypted database
   */
  async open(): Promise<{ success: boolean; error?: string }> {
    try {
      // Initialize encryption
      const encryptionReady = await this.encryption.initialize();
      if (!encryptionReady) {
        return { success: false, error: 'Failed to initialize encryption' };
      }

      // Load or create metadata
      await this.loadMetadata();
      this.isOpen = true;

      console.debug('[EncryptedDB] Database opened successfully');
      return { success: true };
    } catch (error) {
      console.error('[EncryptedDB] Open error:', error);
      return { success: false, error: 'Failed to open database' };
    }
  }

  /**
   * Close the database
   */
  async close(): Promise<void> {
    this.isOpen = false;
    console.debug('[EncryptedDB] Database closed');
  }

  /**
   * Check if database is open
   */
  isDbOpen(): boolean {
    return this.isOpen && this.encryption.isInitialized();
  }

  /**
   * Get a collection (table) from the database
   */
  async getCollection<T>(name: string): Promise<T[]> {
    if (!this.isOpen) {
      throw new Error('Database not open');
    }

    try {
      const key = DB_PREFIX + name;
      const encrypted = await AsyncStorage.getItem(key);

      if (!encrypted) {
        return [];
      }

      const decrypted = await this.encryption.decrypt(encrypted);
      const collection: DatabaseCollection<T> = JSON.parse(decrypted);

      return collection.data;
    } catch (error) {
      console.error(`[EncryptedDB] Get collection ${name} error:`, error);
      return [];
    }
  }

  /**
   * Save a collection to the database
   */
  async saveCollection<T>(name: string, data: T[]): Promise<{ success: boolean; error?: string }> {
    if (!this.isOpen) {
      return { success: false, error: 'Database not open' };
    }

    try {
      const collection: DatabaseCollection<T> = {
        name,
        data,
        lastModified: new Date().toISOString(),
        version: DB_VERSION,
      };

      const json = JSON.stringify(collection);
      const encrypted = await this.encryption.encrypt(json);

      const key = DB_PREFIX + name;
      await AsyncStorage.setItem(key, encrypted);

      // Update metadata
      if (this.metadata && !this.metadata.collections.includes(name)) {
        this.metadata.collections.push(name);
        await this.saveMetadata();
      }

      return { success: true };
    } catch (error) {
      console.error(`[EncryptedDB] Save collection ${name} error:`, error);
      return { success: false, error: 'Failed to save collection' };
    }
  }

  /**
   * Add an item to a collection
   */
  async addItem<T extends { id: string }>(
    collection: string,
    item: T
  ): Promise<{ success: boolean; error?: string }> {
    const data = await this.getCollection<T>(collection);
    data.push(item);

    const result = await this.saveCollection(collection, data);

    if (result.success) {
      await auditLogService.logVaultAccess({
        action: 'created',
        entityType: collection,
        entityId: item.id,
      });
    }

    return result;
  }

  /**
   * Update an item in a collection
   */
  async updateItem<T extends { id: string }>(
    collection: string,
    id: string,
    updates: Partial<T>
  ): Promise<{ success: boolean; error?: string }> {
    const data = await this.getCollection<T>(collection);
    const index = data.findIndex((item) => item.id === id);

    if (index === -1) {
      return { success: false, error: 'Item not found' };
    }

    data[index] = { ...data[index], ...updates };
    const result = await this.saveCollection(collection, data);

    if (result.success) {
      await auditLogService.logVaultAccess({
        action: 'updated',
        entityType: collection,
        entityId: id,
      });
    }

    return result;
  }

  /**
   * Delete an item from a collection
   */
  async deleteItem<T extends { id: string }>(
    collection: string,
    id: string
  ): Promise<{ success: boolean; error?: string }> {
    const data = await this.getCollection<T>(collection);
    const filtered = data.filter((item) => item.id !== id);

    if (filtered.length === data.length) {
      return { success: false, error: 'Item not found' };
    }

    const result = await this.saveCollection(collection, filtered);

    if (result.success) {
      await auditLogService.logVaultAccess({
        action: 'deleted',
        entityType: collection,
        entityId: id,
      });
    }

    return result;
  }

  /**
   * Get a single item by ID
   */
  async getItem<T extends { id: string }>(
    collection: string,
    id: string
  ): Promise<T | null> {
    const data = await this.getCollection<T>(collection);
    const item = data.find((item) => item.id === id) || null;

    if (item) {
      await auditLogService.logVaultAccess({
        action: 'viewed',
        entityType: collection,
        entityId: id,
      });
    }

    return item;
  }

  /**
   * Query items in a collection
   */
  async queryItems<T>(
    collection: string,
    predicate: (item: T) => boolean
  ): Promise<T[]> {
    const data = await this.getCollection<T>(collection);
    return data.filter(predicate);
  }

  /**
   * Clear a collection
   */
  async clearCollection(name: string): Promise<{ success: boolean; error?: string }> {
    if (!this.isOpen) {
      return { success: false, error: 'Database not open' };
    }

    try {
      const key = DB_PREFIX + name;
      await AsyncStorage.removeItem(key);

      if (this.metadata) {
        this.metadata.collections = this.metadata.collections.filter((c) => c !== name);
        await this.saveMetadata();
      }

      await auditLogService.log({
        action: 'data_deleted',
        category: 'data_modification',
        description: `Collection ${name} was cleared`,
        entityType: name,
      });

      return { success: true };
    } catch (error) {
      console.error(`[EncryptedDB] Clear collection ${name} error:`, error);
      return { success: false, error: 'Failed to clear collection' };
    }
  }

  /**
   * Clear all data (factory reset)
   */
  async clearAllData(): Promise<{ success: boolean; error?: string }> {
    if (!this.isOpen) {
      return { success: false, error: 'Database not open' };
    }

    try {
      // Get all keys with our prefix
      const allKeys = await AsyncStorage.getAllKeys();
      const dbKeys = allKeys.filter((key) => key.startsWith(DB_PREFIX));

      await AsyncStorage.multiRemove(dbKeys);

      // Reset metadata
      this.metadata = {
        version: DB_VERSION,
        createdAt: new Date().toISOString(),
        lastModified: new Date().toISOString(),
        collections: [],
        encryptionEnabled: true,
      };
      await this.saveMetadata();

      await auditLogService.log({
        action: 'data_deleted',
        category: 'data_modification',
        description: 'All database data was cleared',
      });

      return { success: true };
    } catch (error) {
      console.error('[EncryptedDB] Clear all data error:', error);
      return { success: false, error: 'Failed to clear all data' };
    }
  }

  /**
   * Export all data (for backup)
   */
  async exportAllData(): Promise<{ success: boolean; data?: string; error?: string }> {
    if (!this.isOpen || !this.metadata) {
      return { success: false, error: 'Database not open' };
    }

    try {
      const exportData: Record<string, unknown[]> = {};

      for (const collection of this.metadata.collections) {
        exportData[collection] = await this.getCollection(collection);
      }

      await auditLogService.log({
        action: 'data_exported',
        category: 'data_access',
        description: 'All data was exported',
        metadata: { collections: this.metadata.collections },
      });

      return { success: true, data: JSON.stringify(exportData) };
    } catch (error) {
      console.error('[EncryptedDB] Export error:', error);
      return { success: false, error: 'Failed to export data' };
    }
  }

  /**
   * Import data (for restore)
   */
  async importData(
    jsonData: string
  ): Promise<{ success: boolean; imported: number; error?: string }> {
    if (!this.isOpen) {
      return { success: false, imported: 0, error: 'Database not open' };
    }

    try {
      const data = JSON.parse(jsonData);
      let imported = 0;

      for (const [collection, items] of Object.entries(data)) {
        if (Array.isArray(items)) {
          await this.saveCollection(collection, items);
          imported += items.length;
        }
      }

      await auditLogService.log({
        action: 'data_imported',
        category: 'data_modification',
        description: `Data imported: ${imported} items`,
        metadata: { itemCount: imported },
      });

      return { success: true, imported };
    } catch (error) {
      console.error('[EncryptedDB] Import error:', error);
      return { success: false, imported: 0, error: 'Failed to import data' };
    }
  }

  /**
   * Get database metadata
   */
  getMetadata(): DatabaseMetadata | null {
    return this.metadata;
  }

  /**
   * Load database metadata
   */
  private async loadMetadata(): Promise<void> {
    try {
      const key = DB_PREFIX + '_metadata';
      const encrypted = await AsyncStorage.getItem(key);

      if (encrypted) {
        const decrypted = await this.encryption.decrypt(encrypted);
        this.metadata = JSON.parse(decrypted);
      } else {
        // Create new metadata
        this.metadata = {
          version: DB_VERSION,
          createdAt: new Date().toISOString(),
          lastModified: new Date().toISOString(),
          collections: [],
          encryptionEnabled: true,
        };
        await this.saveMetadata();
      }
    } catch (error) {
      console.debug('[EncryptedDB] Load metadata error (stale data cleared):', (error as Error).message);
      // Clear stale encrypted data that can't be decrypted (e.g., key mismatch on web)
      const key = DB_PREFIX + '_metadata';
      await AsyncStorage.removeItem(key).catch(() => {});
      this.metadata = {
        version: DB_VERSION,
        createdAt: new Date().toISOString(),
        lastModified: new Date().toISOString(),
        collections: [],
        encryptionEnabled: true,
      };
      await this.saveMetadata();
    }
  }

  /**
   * Save database metadata
   */
  private async saveMetadata(): Promise<void> {
    if (!this.metadata) return;

    try {
      this.metadata.lastModified = new Date().toISOString();

      const key = DB_PREFIX + '_metadata';
      const json = JSON.stringify(this.metadata);
      const encrypted = await this.encryption.encrypt(json);

      await AsyncStorage.setItem(key, encrypted);
    } catch (error) {
      console.error('[EncryptedDB] Save metadata error:', error);
    }
  }
}

export const encryptedDatabaseService = new EncryptedDatabaseService();
export default encryptedDatabaseService;
