import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Vibration,
  Animated,
  Platform,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { biometricAuthService, BiometricCapabilities } from '../services/biometricAuth';

// MOB-3: Key for persisting lockout state across app restarts
const LOCKOUT_KEY = '@karuna/lockout_state';

interface LockScreenProps {
  onUnlock: () => void;
  title?: string;
  subtitle?: string;
  context?: 'app' | 'vault' | 'sensitive';
}

export default function LockScreen({
  onUnlock,
  title = 'Enter PIN',
  subtitle = 'Enter your PIN to continue',
  context = 'vault',
}: LockScreenProps): JSX.Element {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [lockTimer, setLockTimer] = useState(0);
  const [biometricCapabilities, setBiometricCapabilities] = useState<BiometricCapabilities | null>(null);
  const [showBiometric, setShowBiometric] = useState(false);

  const shakeAnim = useState(new Animated.Value(0))[0];

  // MOB-3: Restore persisted lockout state on mount
  useEffect(() => {
    const restoreLockoutState = async () => {
      try {
        const stored = await AsyncStorage.getItem(LOCKOUT_KEY);
        if (stored) {
          const { lockedUntil, attempts: storedAttempts } = JSON.parse(stored) as {
            lockedUntil: number;
            attempts: number;
          };
          const remaining = Math.ceil((lockedUntil - Date.now()) / 1000);
          if (remaining > 0) {
            setIsLocked(true);
            setLockTimer(remaining);
            setAttempts(storedAttempts);
          } else {
            // Lockout expired while app was closed — clean up
            await AsyncStorage.removeItem(LOCKOUT_KEY);
          }
        }
      } catch (err) {
        console.error('[LockScreen] Failed to restore lockout state:', err);
      }
    };

    restoreLockoutState();
    checkBiometricCapabilities();
  }, []);

  // MOB-3: Countdown timer; remove persisted state when lockout expires
  useEffect(() => {
    if (isLocked && lockTimer > 0) {
      const timer = setInterval(() => {
        setLockTimer((prev) => {
          if (prev <= 1) {
            setIsLocked(false);
            // Remove persisted lockout now that it has expired
            AsyncStorage.removeItem(LOCKOUT_KEY).catch(() => {});
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [isLocked, lockTimer]);

  const checkBiometricCapabilities = async () => {
    const capabilities = await biometricAuthService.checkBiometricCapabilities();
    setBiometricCapabilities(capabilities);

    const settings = biometricAuthService.getSecuritySettings();
    if (settings.biometricEnabled && capabilities.isAvailable && capabilities.isEnrolled) {
      setShowBiometric(true);
      // Auto-trigger biometric
      handleBiometricAuth();
    }
  };

  const shake = () => {
    Vibration.vibrate(100);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  // MOB-1: No more auto-submit at 4 digits — just append the digit
  const handlePinInput = (digit: string) => {
    if (isLocked) return;
    if (pin.length >= 8) return;

    const newPin = pin + digit;
    setPin(newPin);
    setError('');
  };

  const handleDelete = () => {
    if (pin.length > 0) {
      setPin(pin.slice(0, -1));
      setError('');
    }
  };

  const handleClear = () => {
    setPin('');
    setError('');
  };

  // MOB-1: Explicit confirm handler
  const handleConfirm = () => {
    if (pin.length >= 4 && !isLocked) {
      verifyPin(pin);
    }
  };

  const verifyPin = async (pinToVerify: string) => {
    const result = await biometricAuthService.verifyPIN(pinToVerify);

    if (result.success) {
      // MOB-3: Clear persisted lockout on successful auth
      await AsyncStorage.removeItem(LOCKOUT_KEY).catch(() => {});
      onUnlock();
    } else {
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      setPin('');
      shake();

      // Lock out after 5 failed attempts
      if (newAttempts >= 5) {
        setIsLocked(true);
        setLockTimer(30); // 30 second lockout
        setAttempts(0);
        setError('Too many attempts. Please wait.');

        // MOB-3: Persist lockout state so it survives app restarts
        AsyncStorage.setItem(
          LOCKOUT_KEY,
          JSON.stringify({ lockedUntil: Date.now() + 30_000, attempts: newAttempts })
        ).catch(() => {});
      } else {
        setError(`Incorrect PIN. ${5 - newAttempts} attempts remaining.`);
      }
    }
  };

  const handleBiometricAuth = async () => {
    const result = await biometricAuthService.authenticateWithBiometric(
      `Authenticate to access ${context === 'vault' ? 'your vault' : 'Karuna'}`
    );

    if (result.success) {
      onUnlock();
    } else if (result.error !== 'Cancelled') {
      setError(result.error || 'Biometric authentication failed');
    }
  };

  // MOB-2: Forgot PIN recovery — wipes all security data then unlocks
  const handleForgotPin = () => {
    Alert.alert(
      'Forgot PIN?',
      'This will reset all security settings and unlock the app. You will need to set up a new PIN afterwards.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset & Continue',
          style: 'destructive',
          onPress: async () => {
            await biometricAuthService.resetAllSecurity();
            await AsyncStorage.removeItem(LOCKOUT_KEY).catch(() => {});
            onUnlock();
          },
        },
      ]
    );
  };

  const getBiometricButtonText = () => {
    if (!biometricCapabilities) return 'Use Biometric';
    if (biometricCapabilities.biometricTypes.includes('facial')) return 'Use Face ID';
    if (biometricCapabilities.biometricTypes.includes('fingerprint')) return 'Use Fingerprint';
    return 'Use Biometric';
  };

  // MOB-1: Dynamic dots — show at least 4 dots, expand as user types beyond 4
  const renderPinDots = () => {
    const dotCount = Math.max(4, pin.length);
    const dots = [];
    for (let i = 0; i < dotCount; i++) {
      dots.push(
        <View
          key={i}
          style={[
            styles.pinDot,
            i < pin.length && styles.pinDotFilled,
            error ? styles.pinDotError : null,
          ]}
        />
      );
    }
    return dots;
  };

  const renderKeypadButton = (value: string, subtext?: string) => (
    <TouchableOpacity
      key={value}
      style={styles.keypadButton}
      onPress={() => handlePinInput(value)}
      disabled={isLocked}
    >
      <Text style={[styles.keypadButtonText, isLocked && styles.textDisabled]}>
        {value}
      </Text>
      {subtext && <Text style={styles.keypadSubtext}>{subtext}</Text>}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.lockIcon}>🔐</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>

        {/* PIN Dots */}
        <Animated.View
          style={[styles.pinDotsContainer, { transform: [{ translateX: shakeAnim }] }]}
        >
          {renderPinDots()}
        </Animated.View>

        {/* Error/Status Message */}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {isLocked ? (
          <Text style={styles.lockTimerText}>
            Locked for {lockTimer} seconds
          </Text>
        ) : null}

        {/* Keypad */}
        <View style={styles.keypad}>
          <View style={styles.keypadRow}>
            {renderKeypadButton('1', '')}
            {renderKeypadButton('2', 'ABC')}
            {renderKeypadButton('3', 'DEF')}
          </View>
          <View style={styles.keypadRow}>
            {renderKeypadButton('4', 'GHI')}
            {renderKeypadButton('5', 'JKL')}
            {renderKeypadButton('6', 'MNO')}
          </View>
          <View style={styles.keypadRow}>
            {renderKeypadButton('7', 'PQRS')}
            {renderKeypadButton('8', 'TUV')}
            {renderKeypadButton('9', 'WXYZ')}
          </View>
          <View style={styles.keypadRow}>
            <TouchableOpacity
              style={styles.keypadButton}
              onPress={handleClear}
              disabled={isLocked}
            >
              <Text style={[styles.keypadButtonText, styles.keypadActionText]}>
                Clear
              </Text>
            </TouchableOpacity>
            {renderKeypadButton('0', '')}
            <TouchableOpacity
              style={styles.keypadButton}
              onPress={handleDelete}
              disabled={isLocked}
            >
              <Text style={[styles.keypadButtonText, styles.keypadActionText]}>
                ⌫
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* MOB-1: Confirm Button */}
        <TouchableOpacity
          style={[
            styles.confirmButton,
            (pin.length < 4 || isLocked) && styles.confirmButtonDisabled,
          ]}
          onPress={handleConfirm}
          disabled={pin.length < 4 || isLocked}
        >
          <Text
            style={[
              styles.confirmButtonText,
              (pin.length < 4 || isLocked) && styles.confirmButtonTextDisabled,
            ]}
          >
            Confirm
          </Text>
        </TouchableOpacity>

        {/* Biometric Button */}
        {showBiometric ? (
          <TouchableOpacity
            style={styles.biometricButton}
            onPress={handleBiometricAuth}
            disabled={isLocked}
          >
            <Text style={styles.biometricIcon}>
              {biometricCapabilities?.biometricTypes.includes('facial') ? '😊' : '👆'}
            </Text>
            <Text style={styles.biometricText}>{getBiometricButtonText()}</Text>
          </TouchableOpacity>
        ) : null}

        {/* MOB-2: Forgot PIN? */}
        <TouchableOpacity style={styles.forgotPinButton} onPress={handleForgotPin}>
          <Text style={styles.forgotPinText}>Forgot PIN?</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  lockIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#333',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  pinDotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 24,
  },
  pinDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#4A90A4',
    marginHorizontal: 8,
  },
  pinDotFilled: {
    backgroundColor: '#4A90A4',
  },
  pinDotError: {
    borderColor: '#F44336',
    backgroundColor: '#F44336',
  },
  errorText: {
    color: '#F44336',
    fontSize: 14,
    marginBottom: 16,
    textAlign: 'center',
  },
  lockTimerText: {
    color: '#FF9800',
    fontSize: 14,
    marginBottom: 16,
    fontWeight: '600',
  },
  keypad: {
    width: '100%',
    maxWidth: 300,
    marginBottom: 24,
  },
  keypadRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 12,
  },
  keypadButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      web: { boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.1)' },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
      },
    }),
  },
  keypadButtonText: {
    fontSize: 28,
    fontWeight: '600',
    color: '#333',
  },
  keypadSubtext: {
    fontSize: 10,
    color: '#999',
    marginTop: 2,
  },
  keypadActionText: {
    fontSize: 16,
    color: '#4A90A4',
  },
  textDisabled: {
    color: '#CCC',
  },
  confirmButton: {
    width: '100%',
    maxWidth: 300,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#4A90A4',
    alignItems: 'center',
    marginBottom: 16,
  },
  confirmButtonDisabled: {
    backgroundColor: '#C5DDE5',
  },
  confirmButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  confirmButtonTextDisabled: {
    color: '#8BB8C5',
  },
  biometricButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: '#E3F2FD',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#90CAF9',
    marginBottom: 16,
  },
  biometricIcon: {
    fontSize: 24,
    marginRight: 8,
  },
  biometricText: {
    fontSize: 16,
    color: '#1976D2',
    fontWeight: '600',
  },
  forgotPinButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  forgotPinText: {
    fontSize: 14,
    color: '#4A90A4',
    textDecorationLine: 'underline',
  },
});
