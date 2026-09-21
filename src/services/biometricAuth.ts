import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { auditLogService } from './auditLog';

const STORAGE_KEYS = {
  PIN_HASH: '@karuna_pin_hash',
  PIN_SALT: '@karuna_pin_salt',
  BIOMETRIC_ENABLED: '@karuna_biometric_enabled',
  APP_LOCK_ENABLED: '@karuna_app_lock_enabled',
  VAULT_LOCK_ENABLED: '@karuna_vault_lock_enabled',
  LAST_AUTH_TIME: '@karuna_last_auth_time',
  AUTH_TIMEOUT_MINUTES: '@karuna_auth_timeout',
};

// Expo SecureStore (keychain/keystore) key for the 32-byte PIN secret. The
// secret is mixed into the PIN hash so that AsyncStorage alone (hash + salt)
// is insufficient to brute-force the PIN — an attacker needs the
// hardware-backed secret too.
const PIN_SECRET_KEY = 'karuna_pin_secret';

// Version prefix for hashes bound to the SecureStore secret. Unprefixed
// hashes are v1 (salt-only); 'pin_'-prefixed are the original legacy format.
const PIN_HASH_V2_PREFIX = 'v2$';

// Number of SHA-256 iterations for PIN hashing (provides brute-force resistance)
const PIN_HASH_ITERATIONS = 10000;

// Default timeout before re-authentication required (in minutes)
const DEFAULT_AUTH_TIMEOUT = 5;

export type BiometricType = 'fingerprint' | 'facial' | 'iris' | 'none';

export interface BiometricCapabilities {
  isAvailable: boolean;
  biometricTypes: BiometricType[];
  isEnrolled: boolean;
  securityLevel: 'none' | 'weak' | 'strong';
}

export interface AuthResult {
  success: boolean;
  method?: 'biometric' | 'pin';
  error?: string;
}

export interface SecuritySettings {
  appLockEnabled: boolean;
  vaultLockEnabled: boolean;
  biometricEnabled: boolean;
  hasPinSet: boolean;
  authTimeoutMinutes: number;
}

class BiometricAuthService {
  private pinHash: string | null = null;
  private pinSalt: string | null = null;
  private pinSecret: string | null = null;
  private pinSecretLoaded = false;
  private biometricEnabled: boolean = false;
  private appLockEnabled: boolean = false;
  private vaultLockEnabled: boolean = true;
  private lastAuthTime: number = 0;
  private authTimeoutMinutes: number = DEFAULT_AUTH_TIMEOUT;
  private isAuthenticated: boolean = false;

  async initialize(): Promise<void> {
    try {
      const [
        pinHash,
        pinSalt,
        biometricEnabled,
        appLockEnabled,
        vaultLockEnabled,
        lastAuthTime,
        authTimeout,
      ] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.PIN_HASH),
        AsyncStorage.getItem(STORAGE_KEYS.PIN_SALT),
        AsyncStorage.getItem(STORAGE_KEYS.BIOMETRIC_ENABLED),
        AsyncStorage.getItem(STORAGE_KEYS.APP_LOCK_ENABLED),
        AsyncStorage.getItem(STORAGE_KEYS.VAULT_LOCK_ENABLED),
        AsyncStorage.getItem(STORAGE_KEYS.LAST_AUTH_TIME),
        AsyncStorage.getItem(STORAGE_KEYS.AUTH_TIMEOUT_MINUTES),
      ]);

      this.pinHash = pinHash;
      this.pinSalt = pinSalt;
      this.biometricEnabled = biometricEnabled === 'true';
      this.appLockEnabled = appLockEnabled === 'true';
      this.vaultLockEnabled = vaultLockEnabled !== 'false'; // Default true
      this.lastAuthTime = lastAuthTime ? parseInt(lastAuthTime, 10) : 0;
      this.authTimeoutMinutes = authTimeout ? parseInt(authTimeout, 10) : DEFAULT_AUTH_TIMEOUT;

      console.debug('[BiometricAuth] Initialized:', {
        hasPIN: !!this.pinHash,
        biometricEnabled: this.biometricEnabled,
        appLockEnabled: this.appLockEnabled,
        vaultLockEnabled: this.vaultLockEnabled,
      });
    } catch (error) {
      console.error('[BiometricAuth] Initialization error:', error);
    }
  }

  /**
   * Check device biometric capabilities
   */
  async checkBiometricCapabilities(): Promise<BiometricCapabilities> {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      const supportedTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();

      const biometricTypes: BiometricType[] = supportedTypes.map((type) => {
        switch (type) {
          case LocalAuthentication.AuthenticationType.FINGERPRINT:
            return 'fingerprint';
          case LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION:
            return 'facial';
          case LocalAuthentication.AuthenticationType.IRIS:
            return 'iris';
          default:
            return 'none';
        }
      }).filter((t) => t !== 'none');

      const securityLevel = await LocalAuthentication.getEnrolledLevelAsync();

      return {
        isAvailable: hasHardware,
        biometricTypes,
        isEnrolled,
        securityLevel: securityLevel === LocalAuthentication.SecurityLevel.BIOMETRIC_STRONG
          ? 'strong'
          : securityLevel === LocalAuthentication.SecurityLevel.BIOMETRIC_WEAK
          ? 'weak'
          : 'none',
      };
    } catch (error) {
      console.error('[BiometricAuth] Capability check error:', error);
      return {
        isAvailable: false,
        biometricTypes: [],
        isEnrolled: false,
        securityLevel: 'none',
      };
    }
  }

  /**
   * Set up PIN code
   */
  async setupPIN(pin: string): Promise<{ success: boolean; error?: string }> {
    if (pin.length < 4 || pin.length > 8) {
      return { success: false, error: 'PIN must be 4-8 digits' };
    }

    if (!/^\d+$/.test(pin)) {
      return { success: false, error: 'PIN must contain only numbers' };
    }

    try {
      // Generate a unique salt for this device/user
      const salt = await this.generateSalt();

      // Bind the hash to the hardware-backed PIN secret (or fall back to
      // salt-only hashing when SecureStore is unavailable — see ensurePinSecret)
      const secret = await this.ensurePinSecret();
      const hash = await this.hashPIN(pin, salt, secret);

      // Store both hash and salt
      await Promise.all([
        AsyncStorage.setItem(STORAGE_KEYS.PIN_HASH, hash),
        AsyncStorage.setItem(STORAGE_KEYS.PIN_SALT, salt),
      ]);

      this.pinHash = hash;
      this.pinSalt = salt;

      await auditLogService.log({
        action: 'security_pin_set',
        category: 'security',
        description: 'PIN code was set up',
      });

      return { success: true };
    } catch (error) {
      console.error('[BiometricAuth] PIN setup error:', error);
      return { success: false, error: 'Failed to save PIN' };
    }
  }

  /**
   * Change PIN code
   */
  async changePIN(currentPin: string, newPin: string): Promise<{ success: boolean; error?: string }> {
    const verifyResult = await this.verifyPIN(currentPin);
    if (!verifyResult.success) {
      return { success: false, error: 'Current PIN is incorrect' };
    }

    return this.setupPIN(newPin);
  }

  /**
   * Remove PIN code
   */
  async removePIN(currentPin: string): Promise<{ success: boolean; error?: string }> {
    const verifyResult = await this.verifyPIN(currentPin);
    if (!verifyResult.success) {
      return { success: false, error: 'PIN is incorrect' };
    }

    try {
      await AsyncStorage.removeItem(STORAGE_KEYS.PIN_HASH);
      await AsyncStorage.removeItem(STORAGE_KEYS.PIN_SALT);
      // Destroy the hardware-backed secret too — a removed PIN must leave
      // nothing recoverable behind.
      await this.deletePinSecret();
      this.pinHash = null;
      this.pinSalt = null;

      // Disable biometric if PIN is removed
      await this.setBiometricEnabled(false);

      await auditLogService.log({
        action: 'security_pin_removed',
        category: 'security',
        description: 'PIN code was removed',
      });

      return { success: true };
    } catch {
      return { success: false, error: 'Failed to remove PIN' };
    }
  }

  /**
   * Verify PIN code
   */
  async verifyPIN(pin: string): Promise<AuthResult> {
    if (!this.pinHash) {
      return { success: false, error: 'No PIN set' };
    }

    try {
      let success = false;

      // Check if this is a legacy hash (starts with 'pin_' and has no salt)
      if (this.pinHash.startsWith('pin_') && !this.pinSalt) {
        // Verify with legacy method
        success = await this.verifyLegacyPIN(pin);

        // If successful, migrate to the current format
        if (success) {
          await this.migratePinHash(pin);
          console.debug('[BiometricAuth] Migrated legacy PIN hash to secure format');
        }
      } else if (this.pinHash.startsWith(PIN_HASH_V2_PREFIX) && this.pinSalt) {
        // v2: hash is bound to the SecureStore secret. Without the secret
        // (e.g. keychain wiped) verification is impossible — fail closed.
        const secret = await this.getPinSecret();
        if (!secret) {
          return { success: false, error: 'Secure storage unavailable' };
        }
        const hash = await this.hashPIN(pin, this.pinSalt, secret);
        success = hash === this.pinHash;
      } else if (this.pinSalt) {
        // v1: salt-only hash (created while SecureStore was unavailable)
        const hash = await this.hashPIN(pin, this.pinSalt, null);
        success = hash === this.pinHash;

        // Opportunistically upgrade to v2 now that we know the PIN
        if (success) {
          await this.migratePinHash(pin);
        }
      }

      if (success) {
        await this.recordAuthentication('pin');
      } else {
        await auditLogService.log({
          action: 'auth_pin_failed',
          category: 'security',
          description: 'Failed PIN authentication attempt',
        });
      }

      return { success, method: 'pin', error: success ? undefined : 'Incorrect PIN' };
    } catch {
      return { success: false, error: 'PIN verification failed' };
    }
  }

  /**
   * Authenticate with biometrics
   */
  async authenticateWithBiometric(reason?: string): Promise<AuthResult> {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: reason || 'Authenticate to continue',
        cancelLabel: 'Use PIN',
        disableDeviceFallback: true,
        fallbackLabel: 'Use PIN',
      });

      if (result.success) {
        await this.recordAuthentication('biometric');
        return { success: true, method: 'biometric' };
      }

      // Log failed attempt
      await auditLogService.log({
        action: 'auth_biometric_failed',
        category: 'security',
        description: 'Failed biometric authentication attempt',
      });

      return {
        success: false,
        error: result.error === 'user_cancel' ? 'Cancelled' : 'Biometric authentication failed',
      };
    } catch (error) {
      console.error('[BiometricAuth] Biometric auth error:', error);
      return { success: false, error: 'Biometric authentication unavailable' };
    }
  }

  /**
   * Authenticate using preferred method (biometric first, then PIN fallback)
   */
  async authenticate(reason?: string): Promise<AuthResult> {
    // Check if recently authenticated
    if (this.isRecentlyAuthenticated()) {
      return { success: true, method: 'biometric' };
    }

    // Try biometric first if enabled
    if (this.biometricEnabled) {
      const capabilities = await this.checkBiometricCapabilities();
      if (capabilities.isAvailable && capabilities.isEnrolled) {
        const result = await this.authenticateWithBiometric(reason);
        if (result.success) {
          return result;
        }
        // Fall through to PIN if biometric fails
      }
    }

    // Return that PIN is required
    return { success: false, error: 'PIN required' };
  }

  /**
   * Check if user is recently authenticated
   */
  isRecentlyAuthenticated(): boolean {
    if (this.lastAuthTime === 0) return false;

    const now = Date.now();
    const timeoutMs = this.authTimeoutMinutes * 60 * 1000;
    return (now - this.lastAuthTime) < timeoutMs;
  }

  /**
   * Record successful authentication
   */
  private async recordAuthentication(method: 'biometric' | 'pin'): Promise<void> {
    this.lastAuthTime = Date.now();
    this.isAuthenticated = true;

    await AsyncStorage.setItem(STORAGE_KEYS.LAST_AUTH_TIME, this.lastAuthTime.toString());

    await auditLogService.log({
      action: `auth_${method}_success`,
      category: 'security',
      description: `Authenticated via ${method}`,
    });
  }

  /**
   * Lock the app (require re-authentication)
   */
  async lock(): Promise<void> {
    this.lastAuthTime = 0;
    this.isAuthenticated = false;
    await AsyncStorage.setItem(STORAGE_KEYS.LAST_AUTH_TIME, '0');

    await auditLogService.log({
      action: 'app_locked',
      category: 'security',
      description: 'App was locked',
    });
  }

  /**
   * Check if authentication is required to proceed
   */
  requiresAuthentication(context: 'app' | 'vault' | 'sensitive'): boolean {
    if (this.isRecentlyAuthenticated()) {
      return false;
    }

    switch (context) {
      case 'app':
        return this.appLockEnabled && this.hasPINSet();
      case 'vault':
      case 'sensitive':
        return this.vaultLockEnabled && this.hasPINSet();
      default:
        return false;
    }
  }

  /**
   * Check if PIN is set
   */
  hasPINSet(): boolean {
    return this.pinHash !== null;
  }

  /**
   * Enable/disable biometric authentication
   */
  async setBiometricEnabled(enabled: boolean): Promise<void> {
    this.biometricEnabled = enabled;
    await AsyncStorage.setItem(STORAGE_KEYS.BIOMETRIC_ENABLED, enabled.toString());

    await auditLogService.log({
      action: enabled ? 'biometric_enabled' : 'biometric_disabled',
      category: 'security',
      description: `Biometric authentication ${enabled ? 'enabled' : 'disabled'}`,
    });
  }

  /**
   * Enable/disable app lock
   */
  async setAppLockEnabled(enabled: boolean): Promise<void> {
    this.appLockEnabled = enabled;
    await AsyncStorage.setItem(STORAGE_KEYS.APP_LOCK_ENABLED, enabled.toString());

    await auditLogService.log({
      action: enabled ? 'app_lock_enabled' : 'app_lock_disabled',
      category: 'security',
      description: `App lock ${enabled ? 'enabled' : 'disabled'}`,
    });
  }

  /**
   * Enable/disable vault lock
   */
  async setVaultLockEnabled(enabled: boolean): Promise<void> {
    this.vaultLockEnabled = enabled;
    await AsyncStorage.setItem(STORAGE_KEYS.VAULT_LOCK_ENABLED, enabled.toString());

    await auditLogService.log({
      action: enabled ? 'vault_lock_enabled' : 'vault_lock_disabled',
      category: 'security',
      description: `Vault lock ${enabled ? 'enabled' : 'disabled'}`,
    });
  }

  /**
   * Set authentication timeout
   */
  async setAuthTimeout(minutes: number): Promise<void> {
    this.authTimeoutMinutes = Math.max(1, Math.min(60, minutes));
    await AsyncStorage.setItem(STORAGE_KEYS.AUTH_TIMEOUT_MINUTES, this.authTimeoutMinutes.toString());
  }

  /**
   * Get current security settings
   */
  getSecuritySettings(): SecuritySettings {
    return {
      appLockEnabled: this.appLockEnabled,
      vaultLockEnabled: this.vaultLockEnabled,
      biometricEnabled: this.biometricEnabled,
      hasPinSet: this.hasPINSet(),
      authTimeoutMinutes: this.authTimeoutMinutes,
    };
  }

  /**
   * Get authenticated state
   */
  getIsAuthenticated(): boolean {
    return this.isAuthenticated || this.isRecentlyAuthenticated();
  }

  /**
   * Reset all security settings — clears PIN hash, salt, and biometric flag.
   * Used as a last-resort recovery when the user has forgotten their PIN.
   */
  async resetAllSecurity(): Promise<void> {
    try {
      await AsyncStorage.multiRemove([
        STORAGE_KEYS.PIN_HASH,
        STORAGE_KEYS.PIN_SALT,
        STORAGE_KEYS.BIOMETRIC_ENABLED,
        STORAGE_KEYS.APP_LOCK_ENABLED,
        STORAGE_KEYS.VAULT_LOCK_ENABLED,
        STORAGE_KEYS.LAST_AUTH_TIME,
        STORAGE_KEYS.AUTH_TIMEOUT_MINUTES,
      ]);

      this.pinHash = null;
      this.pinSalt = null;
      this.biometricEnabled = false;
      this.appLockEnabled = false;
      this.vaultLockEnabled = true;
      this.lastAuthTime = 0;
      this.authTimeoutMinutes = DEFAULT_AUTH_TIMEOUT;
      this.isAuthenticated = false;
      await this.deletePinSecret();

      await auditLogService.log({
        action: 'security_reset',
        category: 'security',
        description: 'All security settings were reset by the user',
      });
    } catch (error) {
      console.error('[BiometricAuth] resetAllSecurity error:', error);
    }
  }

  /**
   * Generate a cryptographically secure random salt
   */
  private async generateSalt(): Promise<string> {
    const randomBytes = await Crypto.getRandomBytesAsync(32);
    // Convert to hex string
    return Array.from(randomBytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Load the hardware-backed PIN secret from SecureStore (cached in memory).
   * Returns null when SecureStore is unavailable — callers must handle the
   * documented fallback / fail-closed paths.
   */
  private async getPinSecret(): Promise<string | null> {
    if (this.pinSecretLoaded) return this.pinSecret;
    try {
      this.pinSecret = await SecureStore.getItemAsync(PIN_SECRET_KEY);
    } catch (error) {
      console.warn('[BiometricAuth] SecureStore unavailable:', error);
      this.pinSecret = null;
    }
    this.pinSecretLoaded = true;
    return this.pinSecret;
  }

  /**
   * Get the existing PIN secret, or generate and store a fresh 32-byte one.
   *
   * Documented fallback: when SecureStore is unavailable (web, or a device
   * without a keychain/keystore), returns null and the PIN is hashed with
   * salt only (v1 format). That is weaker — AsyncStorage alone then suffices
   * for offline brute force — but keeps the app usable; the record upgrades
   * to v2 automatically once SecureStore becomes available and the PIN is
   * next verified.
   */
  private async ensurePinSecret(): Promise<string | null> {
    const existing = await this.getPinSecret();
    if (existing) return existing;
    try {
      const secret = await this.generateSalt(); // 32 random bytes, hex
      await SecureStore.setItemAsync(PIN_SECRET_KEY, secret);
      this.pinSecret = secret;
      return secret;
    } catch (error) {
      console.warn('[BiometricAuth] Could not store PIN secret, using salt-only fallback:', error);
      return null;
    }
  }

  private async deletePinSecret(): Promise<void> {
    this.pinSecret = null;
    this.pinSecretLoaded = false;
    try {
      await SecureStore.deleteItemAsync(PIN_SECRET_KEY);
    } catch {
      // Already absent or SecureStore unavailable — nothing to do
    }
  }

  /**
   * Re-hash the (just-verified) PIN into the current format: a fresh salt and,
   * when SecureStore is available, the hardware-backed secret (v2$ prefix).
   */
  private async migratePinHash(pin: string): Promise<void> {
    const salt = await this.generateSalt();
    const secret = await this.ensurePinSecret();
    const newHash = await this.hashPIN(pin, salt, secret);

    await Promise.all([
      AsyncStorage.setItem(STORAGE_KEYS.PIN_HASH, newHash),
      AsyncStorage.setItem(STORAGE_KEYS.PIN_SALT, salt),
    ]);

    this.pinHash = newHash;
    this.pinSalt = salt;
  }

  /**
   * Secure PIN hashing using iterative SHA-256.
   * When a secret is provided, it is mixed into the input and the result is
   * prefixed with v2$ — verification then requires the SecureStore secret,
   * so the AsyncStorage hash+salt alone are insufficient for brute force.
   */
  private async hashPIN(pin: string, salt: string, secret: string | null): Promise<string> {
    // Combine PIN with salt (and the hardware-backed secret when available)
    let hash = secret ? `${secret}:${salt}:${pin}:${secret}` : `${salt}:${pin}:${salt}`;

    // Apply iterative hashing for key stretching
    for (let i = 0; i < PIN_HASH_ITERATIONS; i++) {
      hash = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        hash + i.toString()
      );
    }

    return secret ? `${PIN_HASH_V2_PREFIX}${hash}` : hash;
  }

  /**
   * Verify PIN against legacy hash format (for migration)
   */
  private async verifyLegacyPIN(pin: string): Promise<boolean> {
    const legacySalt = 'karuna_pin_salt_v1';
    const combined = legacySalt + pin + legacySalt;

    let hash = 0;
    for (let i = 0; i < combined.length; i++) {
      const char = combined.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }

    const legacyHash = `pin_${Math.abs(hash).toString(36)}`;
    return legacyHash === this.pinHash;
  }
}

export const biometricAuthService = new BiometricAuthService();
export default biometricAuthService;
