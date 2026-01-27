/**
 * Web mock for expo-local-authentication
 * Web doesn't have native biometric auth - always falls back to PIN
 */

export const AuthenticationType = {
  FINGERPRINT: 1,
  FACIAL_RECOGNITION: 2,
  IRIS: 3,
} as const;

export const SecurityLevel = {
  NONE: 0,
  SECRET: 1,
  BIOMETRIC: 2,
} as const;

export async function hasHardwareAsync(): Promise<boolean> {
  // Web doesn't have biometric hardware access
  return false;
}

export async function supportedAuthenticationTypesAsync(): Promise<number[]> {
  // No biometric types supported on web
  return [];
}

export async function isEnrolledAsync(): Promise<boolean> {
  // No biometrics enrolled on web
  return false;
}

export async function getEnrolledLevelAsync(): Promise<number> {
  return SecurityLevel.NONE;
}

export async function authenticateAsync(options?: {
  promptMessage?: string;
  cancelLabel?: string;
  disableDeviceFallback?: boolean;
  fallbackLabel?: string;
}): Promise<{
  success: boolean;
  error?: string;
  warning?: string;
}> {
  // On web, we can't do biometric auth
  // Return a message suggesting to use PIN instead
  console.warn('[LocalAuthentication] Biometric auth not available on web, use PIN');

  return {
    success: false,
    error: 'not_available',
    warning: 'Biometric authentication is not available on web. Please use PIN authentication.',
  };
}

export async function cancelAuthenticate(): Promise<void> {
  // No-op on web
}

export default {
  AuthenticationType,
  SecurityLevel,
  hasHardwareAsync,
  supportedAuthenticationTypesAsync,
  isEnrolledAsync,
  getEnrolledLevelAsync,
  authenticateAsync,
  cancelAuthenticate,
};
