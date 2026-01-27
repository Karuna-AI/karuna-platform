import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import { auditLogService } from './auditLog';

const STORAGE_KEYS = {
  PIN_HASH: '@karuna_pin_hash',
  BIOMETRIC_ENABLED: '@karuna_biometric_enabled',
  APP_LOCK_ENABLED: '@karuna_app_lock_enabled',
  VAULT_LOCK_ENABLED: '@karuna_vault_lock_enabled',
  LAST_AUTH_TIME: '@karuna_last_auth_time',
  AUTH_TIMEOUT_MINUTES: '@karuna_auth_timeout',
};

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
        biometricEnabled,
        appLockEnabled,
        vaultLockEnabled,
        lastAuthTime,
        authTimeout,
      ] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.PIN_HASH),
        AsyncStorage.getItem(STORAGE_KEYS.BIOMETRIC_ENABLED),
        AsyncStorage.getItem(STORAGE_KEYS.APP_LOCK_ENABLED),
        AsyncStorage.getItem(STORAGE_KEYS.VAULT_LOCK_ENABLED),
        AsyncStorage.getItem(STORAGE_KEYS.LAST_AUTH_TIME),
        AsyncStorage.getItem(STORAGE_KEYS.AUTH_TIMEOUT_MINUTES),
      ]);

      this.pinHash = pinHash;
      this.biometricEnabled = biometricEnabled === 'true';
      this.appLockEnabled = appLockEnabled === 'true';
      this.vaultLockEnabled = vaultLockEnabled !== 'false'; // Default true
      this.lastAuthTime = lastAuthTime ? parseInt(lastAuthTime, 10) : 0;
      this.authTimeoutMinutes = authTimeout ? parseInt(authTimeout, 10) : DEFAULT_AUTH_TIMEOUT;

      console.log('[BiometricAuth] Initialized:', {
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
      // Hash the PIN (using a simple hash for demo - in production use proper crypto)
      const hash = await this.hashPIN(pin);

      await AsyncStorage.setItem(STORAGE_KEYS.PIN_HASH, hash);
      this.pinHash = hash;

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
      this.pinHash = null;

      // Disable biometric if PIN is removed
      await this.setBiometricEnabled(false);

      await auditLogService.log({
        action: 'security_pin_removed',
        category: 'security',
        description: 'PIN code was removed',
      });

      return { success: true };
    } catch (error) {
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
      const hash = await this.hashPIN(pin);
      const success = hash === this.pinHash;

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
    } catch (error) {
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
   * Simple PIN hashing (in production, use proper crypto with salt)
   */
  private async hashPIN(pin: string): Promise<string> {
    // For production, use a proper hashing library like react-native-crypto
    // This is a simplified version for demonstration
    const salt = 'karuna_pin_salt_v1';
    const combined = salt + pin + salt;

    // Simple hash function (replace with proper crypto in production)
    let hash = 0;
    for (let i = 0; i < combined.length; i++) {
      const char = combined.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }

    return `pin_${Math.abs(hash).toString(36)}`;
  }
}

export const biometricAuthService = new BiometricAuthService();
export default biometricAuthService;
