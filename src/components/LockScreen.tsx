import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  SafeAreaView,
  Vibration,
  Animated,
  Platform,
} from 'react-native';
import { biometricAuthService, BiometricCapabilities } from '../services/biometricAuth';

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

  useEffect(() => {
    checkBiometricCapabilities();
  }, []);

  useEffect(() => {
    // Countdown timer when locked
    if (isLocked && lockTimer > 0) {
      const timer = setInterval(() => {
        setLockTimer((prev) => {
          if (prev <= 1) {
            setIsLocked(false);
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

  const handlePinInput = (digit: string) => {
    if (isLocked) return;
    if (pin.length >= 8) return;

    const newPin = pin + digit;
    setPin(newPin);
    setError('');

    // Auto-submit when PIN is 4-8 digits and user presses confirm or after timeout
    // Or we could auto-verify at 4 digits - let's do 4 for simplicity
    if (newPin.length === 4) {
      verifyPin(newPin);
    }
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

  const verifyPin = async (pinToVerify: string) => {
    const result = await biometricAuthService.verifyPIN(pinToVerify);

    if (result.success) {
      onUnlock();
    } else {
      setAttempts((prev) => prev + 1);
      setPin('');
      shake();

      // Lock out after 5 failed attempts
      if (attempts + 1 >= 5) {
        setIsLocked(true);
        setLockTimer(30); // 30 second lockout
        setAttempts(0);
        setError('Too many attempts. Please wait.');
      } else {
        setError(`Incorrect PIN. ${5 - attempts - 1} attempts remaining.`);
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

  const getBiometricButtonText = () => {
    if (!biometricCapabilities) return 'Use Biometric';
    if (biometricCapabilities.biometricTypes.includes('facial')) return 'Use Face ID';
    if (biometricCapabilities.biometricTypes.includes('fingerprint')) return 'Use Fingerprint';
    return 'Use Biometric';
  };

  const renderPinDots = () => {
    const dots = [];
    for (let i = 0; i < 4; i++) {
      dots.push(
        <View
          key={i}
          style={[
            styles.pinDot,
            i < pin.length && styles.pinDotFilled,
            error && styles.pinDotError,
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
        {error && <Text style={styles.errorText}>{error}</Text>}
        {isLocked && (
          <Text style={styles.lockTimerText}>
            Locked for {lockTimer} seconds
          </Text>
        )}

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

        {/* Biometric Button */}
        {showBiometric && (
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
        )}
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
  biometricButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: '#E3F2FD',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#90CAF9',
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
});
