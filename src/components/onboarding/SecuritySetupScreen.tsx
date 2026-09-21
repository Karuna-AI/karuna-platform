import React, { useState, useEffect, useCallback } from 'react';
import type { JSX } from 'react';
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
      ttsService.speak('Keep your information private. Add a lock so only you can open your health notes and personal vault.').catch(() => {
        // Error already surfaced via onSpeakError.
      });
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
    if (Platform.OS !== 'web') { try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch { /* intentionally empty */ } }
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
    if (Platform.OS !== 'web') { try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch { /* intentionally empty */ } }
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
          // #16: gentle mismatch guidance — no alarm, simple next step.
          shake();
          setError("Those numbers didn't match. No worries — let's try again.");
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
      telemetryService.track('onboarding_security_setup', { method });
      setPhase('done');
      if (Platform.OS !== 'web') { try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch { /* intentionally empty */ } }
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
  // #15: plain language — say what the action does, not the brand name.
  const biometricLabel = biometricCaps?.biometricTypes.includes('facial')
    ? 'Unlock with My Face'
    : 'Unlock with My Fingerprint';

  // Choose method phase
  if (phase === 'choose') {
    return (
      <View style={onboardingStyles.content}>
        <IconCircle icon="🛡️" />
        <Text style={onboardingStyles.title}>Keep Your Information Private</Text>
        <Text style={onboardingStyles.subtitle}>
          Choose a lock so only you can open your health notes and personal vault
        </Text>

        <View style={onboardingStyles.bottomArea}>
          {biometricAvailable && (
            <OnboardingButton
              title={biometricLabel}
              onPress={handleBiometric}
              accessibilityHint="Sets up face or fingerprint unlock plus a backup PIN"
            />
          )}
          <OnboardingButton
            title="Set a 4-digit PIN"
            onPress={() => setPhase('enter_pin')}
            style={biometricAvailable ? { backgroundColor: colors.surface } : undefined}
            accessibilityHint="Creates a 4-digit number code to lock your data"
          />
          <OnboardingSecondaryButton
            title="Skip for now"
            onPress={handleSkip}
            accessibilityHint="Skips the lock. You can add one later in Settings."
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
        <Text style={onboardingStyles.title}>All Set!</Text>
        <Text style={onboardingStyles.subtitle}>Only you can open your information now</Text>
      </View>
    );
  }

  // PIN entry / confirm phase
  const currentPin = phase === 'enter_pin' ? pin : confirmPin;
  const promptText = phase === 'enter_pin' ? 'Choose a 4-Number Code' : 'Enter the Same Code Again';

  return (
    <Animated.View style={[onboardingStyles.content, { transform: [{ translateX: shakeAnim }] }]}>
      <Text style={onboardingStyles.title}>{promptText}</Text>
      <Text style={onboardingStyles.subtitle}>
        {phase === 'enter_pin'
          ? 'Pick numbers that are easy for you to remember'
          : 'Enter the same 4 numbers again'}
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
