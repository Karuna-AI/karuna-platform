import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Vibration,
  Animated,
  Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { biometricAuthService, BiometricCapabilities } from '../../services/biometricAuth';
import { onboardingStore } from '../../services/onboardingStore';
import { telemetryService } from '../../services/telemetry';
import { ttsService } from '../../services/tts';
import { getColors, getFontSizes, SPACING, TOUCH_TARGETS } from '../../utils/accessibility';
import {
  OnboardingScreenProps,
  OnboardingButton,
  OnboardingSecondaryButton,
  IconCircle,
  onboardingStyles,
} from './shared';

const colors = getColors(true);
const fonts = getFontSizes('large');

type Phase = 'choose' | 'enter_pin' | 'confirm_pin' | 'done';

export function SecuritySetupScreen({
  onNext,
  readAloudEnabled,
}: OnboardingScreenProps): JSX.Element {
  const [phase, setPhase] = useState<Phase>('choose');
  const [biometricCaps, setBiometricCaps] = useState<BiometricCapabilities | null>(null);
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [shakeAnim] = useState(new Animated.Value(0));

  useEffect(() => {
    checkBiometrics();
  }, []);

  useEffect(() => {
    if (readAloudEnabled && phase === 'choose') {
      ttsService.speak('Protect your information. Set up a PIN or use biometrics to keep your data safe.');
    }
  }, [readAloudEnabled, phase]);

  const checkBiometrics = async () => {
    const caps = await biometricAuthService.checkBiometricCapabilities();
    setBiometricCaps(caps);
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

  const handleBiometric = useCallback(async () => {
    if (Platform.OS !== 'web') { try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {} }
    try {
      await biometricAuthService.setBiometricEnabled(true);
      // Still need a PIN as fallback
      setPhase('enter_pin');
    } catch (error) {
      console.error('Biometric setup error:', error);
      setPhase('enter_pin');
    }
  }, []);

  const handlePinDigit = useCallback(async (digit: string) => {
    if (Platform.OS !== 'web') { try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {} }
    setError('');

    if (phase === 'enter_pin') {
      const newPin = pin + digit;
      setPin(newPin);
      if (newPin.length === 4) {
        setTimeout(() => setPhase('confirm_pin'), 200);
      }
    } else if (phase === 'confirm_pin') {
      const newConfirm = confirmPin + digit;
      setConfirmPin(newConfirm);
      if (newConfirm.length === 4) {
        if (newConfirm === pin) {
          completePinSetup(newConfirm);
        } else {
          shake();
          setError('PINs do not match. Try again.');
          setPin('');
          setConfirmPin('');
          setTimeout(() => setPhase('enter_pin'), 300);
        }
      }
    }
  }, [phase, pin, confirmPin]);

  const handleBackspace = useCallback(() => {
    if (phase === 'enter_pin') {
      setPin((prev) => prev.slice(0, -1));
    } else if (phase === 'confirm_pin') {
      setConfirmPin((prev) => prev.slice(0, -1));
    }
  }, [phase]);

  const completePinSetup = async (finalPin: string) => {
    try {
      await biometricAuthService.setupPIN(finalPin);
      await biometricAuthService.setVaultLockEnabled(true);
      const method = biometricCaps?.isAvailable && biometricCaps?.isEnrolled ? 'biometric' : 'pin';
      await onboardingStore.setSecurityMethod(method);
      telemetryService.track('onboarding_security_setup', { errorType: method });
      setPhase('done');
      if (Platform.OS !== 'web') { try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {} }
      setTimeout(() => onNext(), 600);
    } catch (error) {
      console.error('PIN setup error:', error);
      setError('Failed to set PIN. Please try again.');
      setPin('');
      setConfirmPin('');
      setPhase('enter_pin');
    }
  };

  const handleSkip = useCallback(async () => {
    await onboardingStore.setSecurityMethod('none');
    telemetryService.track('onboarding_security_skipped');
    onNext();
  }, [onNext]);

  const biometricAvailable = biometricCaps?.isAvailable && biometricCaps?.isEnrolled;
  const biometricLabel = biometricCaps?.biometricTypes.includes('facial')
    ? 'Use Face ID'
    : 'Use Fingerprint';

  // Choose method phase
  if (phase === 'choose') {
    return (
      <View style={onboardingStyles.content}>
        <IconCircle icon="🛡️" />
        <Text style={onboardingStyles.title}>Protect Your Information</Text>
        <Text style={onboardingStyles.subtitle}>
          Keep your health data and personal vault secure
        </Text>

        <View style={onboardingStyles.bottomArea}>
          {biometricAvailable && (
            <OnboardingButton
              title={biometricLabel}
              onPress={handleBiometric}
              accessibilityHint="Sets up biometric authentication plus a backup PIN"
            />
          )}
          <OnboardingButton
            title="Set a 4-digit PIN"
            onPress={() => setPhase('enter_pin')}
            style={biometricAvailable ? { backgroundColor: colors.surface } : undefined}
            accessibilityHint="Creates a 4-digit PIN to protect your data"
          />
          <OnboardingSecondaryButton
            title="Skip for now"
            onPress={handleSkip}
            accessibilityHint="Skips security setup. You can set it up later."
          />
        </View>
      </View>
    );
  }

  // Done phase (brief success)
  if (phase === 'done') {
    return (
      <View style={onboardingStyles.content}>
        <IconCircle icon="✅" color={colors.success} />
        <Text style={onboardingStyles.title}>Security Set Up!</Text>
        <Text style={onboardingStyles.subtitle}>Your data is now protected</Text>
      </View>
    );
  }

  // PIN entry / confirm phase
  const currentPin = phase === 'enter_pin' ? pin : confirmPin;
  const promptText = phase === 'enter_pin' ? 'Create a 4-digit PIN' : 'Confirm your PIN';

  return (
    <Animated.View style={[onboardingStyles.content, { transform: [{ translateX: shakeAnim }] }]}>
      <Text style={onboardingStyles.title}>{promptText}</Text>
      <Text style={onboardingStyles.subtitle}>
        {phase === 'enter_pin'
          ? 'Choose a PIN you will remember'
          : 'Enter the same PIN again'}
      </Text>

      {/* PIN dots */}
      <View style={styles.pinDots}>
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            style={[styles.pinDot, i < currentPin.length && styles.pinDotFilled]}
          />
        ))}
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {/* Number pad */}
      <View style={styles.keypad}>
        {[
          ['1', '2', '3'],
          ['4', '5', '6'],
          ['7', '8', '9'],
          ['', '0', '⌫'],
        ].map((row, rowIndex) => (
          <View key={rowIndex} style={styles.keypadRow}>
            {row.map((digit) => (
              <TouchableOpacity
                key={digit || `empty-${rowIndex}`}
                style={[styles.keypadButton, !digit && styles.keypadButtonEmpty]}
                onPress={() => {
                  if (digit === '⌫') handleBackspace();
                  else if (digit) handlePinDigit(digit);
                }}
                disabled={!digit}
                accessible
                accessibilityRole="button"
                accessibilityLabel={
                  digit === '⌫' ? 'Delete' : digit ? `Number ${digit}` : undefined
                }
              >
                <Text style={[styles.keypadText, digit === '⌫' && styles.keypadBackspace]}>
                  {digit}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ))}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pinDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.md,
    marginVertical: SPACING.xl,
  },
  pinDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: 'transparent',
  },
  pinDotFilled: {
    backgroundColor: colors.primary,
  },
  errorText: {
    color: colors.error,
    fontSize: fonts.body,
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  keypad: {
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
  },
  keypadRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.sm,
  },
  keypadButton: {
    width: TOUCH_TARGETS.large,
    height: TOUCH_TARGETS.large,
    borderRadius: TOUCH_TARGETS.large / 2,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  keypadButtonEmpty: {
    backgroundColor: 'transparent',
  },
  keypadText: {
    fontSize: fonts.headerLarge,
    fontWeight: '600',
    color: colors.text,
  },
  keypadBackspace: {
    fontSize: fonts.header,
  },
});
