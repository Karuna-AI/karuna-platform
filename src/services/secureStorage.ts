import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { auditLogService } from './auditLog';

const KEY_PREFIX = 'karuna_secure_';

export interface SecureStorageOptions {
  requireAuthentication?: boolean;
  authenticationPrompt?: string;
  keychainAccessible?: 'WHEN_UNLOCKED' | 'AFTER_FIRST_UNLOCK' | 'ALWAYS';
}

export interface StoredKey {
  key: string;
  createdAt: string;
  lastAccessedAt: string;
  purpose: string;
}

class SecureStorageService {
  private keyRegistry: Map<string, StoredKey> = new Map();

  /**
   * Check if secure storage is available on this device
   */
  async isAvailable(): Promise<boolean> {
    try {
      return await SecureStore.isAvailableAsync();
    } catch {
      return false;
    }
  }

  /**
   * Store a value securely in the system keychain/keystore
   */
  async setItem(
    key: string,
    value: string,
    options: SecureStorageOptions = {}
  ): Promise<{ success: boolean; error?: string }> {
    const fullKey = KEY_PREFIX + key;

    try {
      const storeOptions: SecureStore.SecureStoreOptions = {
        keychainAccessible: this.mapAccessible(options.keychainAccessible),
      };

      // On iOS, we can require biometric authentication
      if (Platform.OS === 'ios' && options.requireAuthentication) {
        storeOptions.requireAuthentication = true;
        storeOptions.authenticationPrompt = options.authenticationPrompt || 'Authenticate to access secure data';
      }

      await SecureStore.setItemAsync(fullKey, value, storeOptions);

      // Track the key in registry
      const storedKey: StoredKey = {
        key: fullKey,
        createdAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
        purpose: key,
      };
      this.keyRegistry.set(fullKey, storedKey);

      await auditLogService.log({
        action: 'secure_store_write',
        category: 'security',
        description: `Secure value stored: ${key}`,
        metadata: { key },
      });

      return { success: true };
    } catch (error) {
      console.error('[SecureStorage] Set error:', error);
      return { success: false, error: 'Failed to store secure value' };
    }
  }

  /**
   * Retrieve a value from secure storage
   */
  async getItem(
    key: string,
    options: SecureStorageOptions = {}
  ): Promise<{ success: boolean; value?: string; error?: string }> {
    const fullKey = KEY_PREFIX + key;

    try {
      const storeOptions: SecureStore.SecureStoreOptions = {};

      if (Platform.OS === 'ios' && options.requireAuthentication) {
        storeOptions.requireAuthentication = true;
        storeOptions.authenticationPrompt = options.authenticationPrompt || 'Authenticate to access secure data';
      }

      const value = await SecureStore.getItemAsync(fullKey, storeOptions);

      if (value === null) {
        return { success: false, error: 'Key not found' };
      }

      // Update last accessed time
      const storedKey = this.keyRegistry.get(fullKey);
      if (storedKey) {
        storedKey.lastAccessedAt = new Date().toISOString();
      }

      await auditLogService.log({
        action: 'secure_store_read',
        category: 'security',
        description: `Secure value accessed: ${key}`,
        metadata: { key },
      });

      return { success: true, value };
    } catch (error) {
      console.error('[SecureStorage] Get error:', error);

      // Check if error is due to authentication failure
      const errorMessage = (error as Error).message || '';
      if (errorMessage.includes('authentication') || errorMessage.includes('canceled')) {
        return { success: false, error: 'Authentication required' };
      }

      return { success: false, error: 'Failed to retrieve secure value' };
    }
  }

  /**
   * Delete a value from secure storage
   */
  async deleteItem(key: string): Promise<{ success: boolean; error?: string }> {
    const fullKey = KEY_PREFIX + key;

    try {
      await SecureStore.deleteItemAsync(fullKey);
      this.keyRegistry.delete(fullKey);

      await auditLogService.log({
        action: 'secure_store_delete',
        category: 'security',
        description: `Secure value deleted: ${key}`,
        metadata: { key },
      });

      return { success: true };
    } catch (error) {
      console.error('[SecureStorage] Delete error:', error);
      return { success: false, error: 'Failed to delete secure value' };
    }
  }

  /**
   * Generate and store a random encryption key
   */
  async generateKey(
    keyName: string,
    options: SecureStorageOptions = {}
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Generate a random 256-bit key
      const keyBytes = new Uint8Array(32);
      crypto.getRandomValues(keyBytes);

      // Convert to base64 for storage
      const keyBase64 = btoa(String.fromCharCode(...keyBytes));

      return this.setItem(keyName, keyBase64, options);
    } catch (error) {
      console.error('[SecureStorage] Key generation error:', error);
      return { success: false, error: 'Failed to generate key' };
    }
  }

  /**
   * Get or generate an encryption key
   */
  async getOrGenerateKey(
    keyName: string,
    options: SecureStorageOptions = {}
  ): Promise<{ success: boolean; key?: string; error?: string }> {
    // Try to get existing key
    const existing = await this.getItem(keyName, options);
    if (existing.success && existing.value) {
      return { success: true, key: existing.value };
    }

    // Generate new key
    const genResult = await this.generateKey(keyName, options);
    if (!genResult.success) {
      return { success: false, error: genResult.error };
    }

    // Retrieve the newly generated key
    const newKey = await this.getItem(keyName, options);
    if (newKey.success && newKey.value) {
      return { success: true, key: newKey.value };
    }

    return { success: false, error: 'Failed to generate and retrieve key' };
  }

  /**
   * Store the vault encryption key derived from PIN
   */
  async storeVaultKey(
    derivedKey: string,
    options: SecureStorageOptions = {}
  ): Promise<{ success: boolean; error?: string }> {
    return this.setItem('vault_encryption_key', derivedKey, {
      ...options,
      keychainAccessible: 'WHEN_UNLOCKED',
    });
  }

  /**
   * Retrieve the vault encryption key
   */
  async getVaultKey(
    options: SecureStorageOptions = {}
  ): Promise<{ success: boolean; key?: string; error?: string }> {
    const result = await this.getItem('vault_encryption_key', options);
    return {
      success: result.success,
      key: result.value,
      error: result.error,
    };
  }

  /**
   * Store a master key for database encryption
   */
  async storeDatabaseKey(key: string): Promise<{ success: boolean; error?: string }> {
    return this.setItem('database_encryption_key', key, {
      keychainAccessible: 'AFTER_FIRST_UNLOCK',
    });
  }

  /**
   * Get or generate database encryption key
   */
  async getDatabaseKey(): Promise<{ success: boolean; key?: string; error?: string }> {
    return this.getOrGenerateKey('database_encryption_key', {
      keychainAccessible: 'AFTER_FIRST_UNLOCK',
    });
  }

  /**
   * Store caregiver auth token securely
   */
  async storeCaregiverToken(token: string): Promise<{ success: boolean; error?: string }> {
    return this.setItem('caregiver_auth_token', token, {
      keychainAccessible: 'WHEN_UNLOCKED',
    });
  }

  /**
   * Get caregiver auth token
   */
  async getCaregiverToken(): Promise<{ success: boolean; token?: string; error?: string }> {
    const result = await this.getItem('caregiver_auth_token');
    return {
      success: result.success,
      token: result.value,
      error: result.error,
    };
  }

  /**
   * Clear all secure storage (for account reset)
   */
  async clearAll(): Promise<{ success: boolean; error?: string }> {
    const keysToDelete = [
      'vault_encryption_key',
      'database_encryption_key',
      'caregiver_auth_token',
    ];

    try {
      await Promise.all(keysToDelete.map((key) => this.deleteItem(key)));

      await auditLogService.log({
        action: 'secure_store_cleared',
        category: 'security',
        description: 'All secure storage was cleared',
      });

      return { success: true };
    } catch (error) {
      console.error('[SecureStorage] Clear all error:', error);
      return { success: false, error: 'Failed to clear secure storage' };
    }
  }

  /**
   * Map accessible option to SecureStore constant
   */
  private mapAccessible(
    accessible?: 'WHEN_UNLOCKED' | 'AFTER_FIRST_UNLOCK' | 'ALWAYS'
  ): SecureStore.SecureStoreOptions['keychainAccessible'] {
    switch (accessible) {
      case 'WHEN_UNLOCKED':
        return SecureStore.WHEN_UNLOCKED;
      case 'AFTER_FIRST_UNLOCK':
        return SecureStore.AFTER_FIRST_UNLOCK;
      case 'ALWAYS':
        return SecureStore.ALWAYS;
      default:
        return SecureStore.WHEN_UNLOCKED;
    }
  }
}

export const secureStorageService = new SecureStorageService();
export default secureStorageService;
