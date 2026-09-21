/**
 * Secure Storage Service Tests
 * Covers the keychain/keystore wrapper: availability, CRUD, key generation,
 * convenience accessors, and error paths. Native modules are mocked.
 */
import { Platform } from 'react-native';

jest.mock('expo-secure-store', () => ({
  isAvailableAsync: jest.fn(),
  setItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
  WHEN_UNLOCKED: 'WHEN_UNLOCKED',
  AFTER_FIRST_UNLOCK: 'AFTER_FIRST_UNLOCK',
  ALWAYS: 'ALWAYS',
}));

jest.mock('expo-crypto', () => ({
  getRandomBytesAsync: jest.fn(),
}));

jest.mock('../../src/services/auditLog', () => ({
  auditLogService: {
    log: jest.fn().mockResolvedValue(undefined),
  },
}));

import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { secureStorageService } from '../../src/services/secureStorage';

const mockIsAvailable = SecureStore.isAvailableAsync as jest.Mock;
const mockSetItem = SecureStore.setItemAsync as jest.Mock;
const mockGetItem = SecureStore.getItemAsync as jest.Mock;
const mockDeleteItem = SecureStore.deleteItemAsync as jest.Mock;
const mockRandomBytes = Crypto.getRandomBytesAsync as jest.Mock;

describe('secureStorageService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsAvailable.mockResolvedValue(true);
    // Run as iOS (non-web) by default
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
  });

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
  });

  describe('isAvailable', () => {
    it('returns false on web without calling the native module', async () => {
      Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
      await expect(secureStorageService.isAvailable()).resolves.toBe(false);
      expect(mockIsAvailable).not.toHaveBeenCalled();
    });

    it('delegates to SecureStore.isAvailableAsync on native', async () => {
      await expect(secureStorageService.isAvailable()).resolves.toBe(true);
      expect(mockIsAvailable).toHaveBeenCalled();
    });

    it('returns false when the native check throws', async () => {
      mockIsAvailable.mockRejectedValue(new Error('nope'));
      await expect(secureStorageService.isAvailable()).resolves.toBe(false);
    });
  });

  describe('setItem / getItem / deleteItem', () => {
    it('stores with the karuna_secure_ prefix and default accessibility', async () => {
      mockSetItem.mockResolvedValue(undefined);
      const result = await secureStorageService.setItem('myKey', 'myValue');
      expect(result).toEqual({ success: true });
      expect(mockSetItem).toHaveBeenCalledWith(
        'karuna_secure_myKey',
        'myValue',
        expect.objectContaining({ keychainAccessible: 'WHEN_UNLOCKED' })
      );
    });

    it('maps AFTER_FIRST_UNLOCK and ALWAYS accessibility options', async () => {
      mockSetItem.mockResolvedValue(undefined);
      await secureStorageService.setItem('a', 'v', { keychainAccessible: 'AFTER_FIRST_UNLOCK' });
      expect(mockSetItem).toHaveBeenLastCalledWith(
        'karuna_secure_a', 'v', expect.objectContaining({ keychainAccessible: 'AFTER_FIRST_UNLOCK' })
      );
      await secureStorageService.setItem('b', 'v', { keychainAccessible: 'ALWAYS' });
      expect(mockSetItem).toHaveBeenLastCalledWith(
        'karuna_secure_b', 'v', expect.objectContaining({ keychainAccessible: 'ALWAYS' })
      );
    });

    it('returns failure when the native store throws', async () => {
      mockSetItem.mockRejectedValue(new Error('keychain locked'));
      const result = await secureStorageService.setItem('k', 'v');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to store secure value');
    });

    it('retrieves a stored value', async () => {
      mockGetItem.mockResolvedValue('secret-value');
      const result = await secureStorageService.getItem('myKey');
      expect(result).toEqual({ success: true, value: 'secret-value' });
      expect(mockGetItem).toHaveBeenCalledWith('karuna_secure_myKey', expect.anything());
    });

    it('returns "Key not found" when the native store returns null', async () => {
      mockGetItem.mockResolvedValue(null);
      const result = await secureStorageService.getItem('missing');
      expect(result).toEqual({ success: false, error: 'Key not found' });
    });

    it('maps authentication failures to "Authentication required"', async () => {
      mockGetItem.mockRejectedValue(new Error('User authentication canceled'));
      const result = await secureStorageService.getItem('k');
      expect(result).toEqual({ success: false, error: 'Authentication required' });
    });

    it('returns a generic error for other retrieval failures', async () => {
      mockGetItem.mockRejectedValue(new Error('disk full'));
      const result = await secureStorageService.getItem('k');
      expect(result).toEqual({ success: false, error: 'Failed to retrieve secure value' });
    });

    it('deletes a stored value', async () => {
      mockDeleteItem.mockResolvedValue(undefined);
      const result = await secureStorageService.deleteItem('myKey');
      expect(result).toEqual({ success: true });
      expect(mockDeleteItem).toHaveBeenCalledWith('karuna_secure_myKey');
    });

    it('refuses all operations on web', async () => {
      Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
      await expect(secureStorageService.setItem('k', 'v')).resolves.toEqual({
        success: false, error: 'Secure storage not available on web',
      });
      await expect(secureStorageService.getItem('k')).resolves.toEqual({
        success: false, error: 'Secure storage not available on web',
      });
      await expect(secureStorageService.deleteItem('k')).resolves.toEqual({
        success: false, error: 'Secure storage not available on web',
      });
      expect(mockSetItem).not.toHaveBeenCalled();
    });
  });

  describe('generateKey / getOrGenerateKey', () => {
    it('generates a 256-bit key and stores it base64-encoded', async () => {
      const bytes = new Uint8Array(32).map((_, i) => i);
      mockRandomBytes.mockResolvedValue(bytes);
      mockSetItem.mockResolvedValue(undefined);
      const result = await secureStorageService.generateKey('encKey');
      expect(result.success).toBe(true);
      expect(mockRandomBytes).toHaveBeenCalledWith(32);
      const storedValue = mockSetItem.mock.calls[0][1] as string;
      // 32 bytes -> 44 base64 chars
      expect(storedValue).toMatch(/^[A-Za-z0-9+/=]{44}$/);
    });

    it('returns failure when random byte generation throws', async () => {
      mockRandomBytes.mockRejectedValue(new Error('no entropy'));
      const result = await secureStorageService.generateKey('encKey');
      expect(result).toEqual({ success: false, error: 'Failed to generate key' });
    });

    it('getOrGenerateKey returns the existing key without generating', async () => {
      mockGetItem.mockResolvedValue('existing-key');
      const result = await secureStorageService.getOrGenerateKey('encKey');
      expect(result).toEqual({ success: true, key: 'existing-key' });
      expect(mockRandomBytes).not.toHaveBeenCalled();
    });

    it('getOrGenerateKey generates then retrieves when no key exists', async () => {
      const bytes = new Uint8Array(32).fill(7);
      mockRandomBytes.mockResolvedValue(bytes);
      mockSetItem.mockResolvedValue(undefined);
      mockGetItem
        .mockResolvedValueOnce(null) // first lookup: missing
        .mockResolvedValueOnce('newly-generated-key'); // after generation
      const result = await secureStorageService.getOrGenerateKey('encKey');
      expect(result).toEqual({ success: true, key: 'newly-generated-key' });
      expect(mockRandomBytes).toHaveBeenCalledWith(32);
    });
  });

  describe('convenience accessors', () => {
    it('storeVaultKey forces WHEN_UNLOCKED accessibility', async () => {
      mockSetItem.mockResolvedValue(undefined);
      await secureStorageService.storeVaultKey('derived-key-123');
      expect(mockSetItem).toHaveBeenCalledWith(
        'karuna_secure_vault_encryption_key',
        'derived-key-123',
        expect.objectContaining({ keychainAccessible: 'WHEN_UNLOCKED' })
      );
    });

    it('getVaultKey maps value to key', async () => {
      mockGetItem.mockResolvedValue('vault-key');
      await expect(secureStorageService.getVaultKey()).resolves.toEqual({
        success: true, key: 'vault-key', error: undefined,
      });
    });

    it('storeCaregiverToken / getCaregiverToken round-trip the token key', async () => {
      mockSetItem.mockResolvedValue(undefined);
      await secureStorageService.storeCaregiverToken('tok-abc');
      expect(mockSetItem).toHaveBeenCalledWith(
        'karuna_secure_caregiver_auth_token', 'tok-abc', expect.anything()
      );
      mockGetItem.mockResolvedValue('tok-abc');
      await expect(secureStorageService.getCaregiverToken()).resolves.toEqual({
        success: true, token: 'tok-abc', error: undefined,
      });
    });

    it('clearAll deletes the three known keys', async () => {
      mockDeleteItem.mockResolvedValue(undefined);
      const result = await secureStorageService.clearAll();
      expect(result).toEqual({ success: true });
      const deleted = mockDeleteItem.mock.calls.map((c) => c[0]);
      expect(deleted).toEqual(expect.arrayContaining([
        'karuna_secure_vault_encryption_key',
        'karuna_secure_database_encryption_key',
        'karuna_secure_caregiver_auth_token',
      ]));
    });
  });
});
