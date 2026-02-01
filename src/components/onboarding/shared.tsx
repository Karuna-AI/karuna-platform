import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ViewStyle,
} from 'react-native';
import { getColors, getFontSizes, SPACING, TOUCH_TARGETS } from '../../utils/accessibility';

const colors = getColors(true);
const fonts = getFontSizes('large');

// ── Shared Styles ──────────────────────────────────────────────────

export const onboardingStyles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    paddingHorizontal: SPACING.lg,
  },
  header: {
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
  },
  bottomArea: {
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.sm,
    gap: SPACING.md,
  },
  title: {
    fontSize: fonts.headerLarge,
    fontWeight: 'bold',
    color: colors.text,
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  subtitle: {
    fontSize: fonts.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: fonts.body * 1.5,
  },
  whyText: {
    fontSize: fonts.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: SPACING.md,
    lineHeight: fonts.body * 1.4,
  },
});

// ── OnboardingScreen Props ────────────────────────────────────────

export interface OnboardingScreenProps {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  readAloudEnabled: boolean;
  onToggleReadAloud: () => void;
}

// ── Primary Button ────────────────────────────────────────────────

interface ButtonProps {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: ViewStyle;
}

export function OnboardingButton({
  title,
  onPress,
  disabled = false,
  accessibilityLabel,
  accessibilityHint,
  style,
}: ButtonProps): JSX.Element {
  return (
    <TouchableOpacity
      style={[
        styles.primaryButton,
        disabled && styles.primaryButtonDisabled,
        style,
      ]}
      onPress={onPress}
      disabled={disabled}
      accessible
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
    >
      <Text style={[styles.primaryButtonText, disabled && styles.primaryButtonTextDisabled]}>
        {title}
      </Text>
    </TouchableOpacity>
  );
}

// ── Secondary / Text Button ───────────────────────────────────────

interface SecondaryButtonProps {
  title: string;
  onPress: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

export function OnboardingSecondaryButton({
  title,
  onPress,
  accessibilityLabel,
  accessibilityHint,
}: SecondaryButtonProps): JSX.Element {
  return (
    <TouchableOpacity
      style={styles.secondaryButton}
      onPress={onPress}
      accessible
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || title}
      accessibilityHint={accessibilityHint}
    >
      <Text style={styles.secondaryButtonText}>{title}</Text>
    </TouchableOpacity>
  );
}

// ── Progress Dots ─────────────────────────────────────────────────

interface ProgressDotsProps {
  total: number;
  current: number;
}

export function ProgressDots({ total, current }: ProgressDotsProps): JSX.Element {
  return (
    <View
      style={styles.dotsContainer}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${current + 1} of ${total}`}
    >
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            i === current ? styles.dotActive : styles.dotInactive,
          ]}
        />
      ))}
    </View>
  );
}

// ── Read Aloud Toggle ─────────────────────────────────────────────

interface ReadAloudToggleProps {
  enabled: boolean;
  onToggle: () => void;
}

export function ReadAloudToggle({ enabled, onToggle }: ReadAloudToggleProps): JSX.Element {
  return (
    <TouchableOpacity
      style={[styles.readAloudToggle, enabled && styles.readAloudToggleActive]}
      onPress={onToggle}
      accessible
      accessibilityRole="switch"
      accessibilityLabel="Read aloud"
      accessibilityState={{ checked: enabled }}
      accessibilityHint="Speaks screen content aloud when enabled"
    >
      <Text style={styles.readAloudIcon}>{enabled ? '🔊' : '🔇'}</Text>
      <Text style={[styles.readAloudText, enabled && styles.readAloudTextActive]}>
        Read Aloud
      </Text>
    </TouchableOpacity>
  );
}

// ── Icon Circle ───────────────────────────────────────────────────

interface IconCircleProps {
  icon: string;
  size?: number;
  color?: string;
}

export function IconCircle({
  icon,
  size = 100,
  color = colors.primary,
}: IconCircleProps): JSX.Element {
  return (
    <View
      style={[
        styles.iconCircle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color + '18', // 10% opacity
        },
      ]}
    >
      <Text style={{ fontSize: size * 0.45 }}>{icon}</Text>
    </View>
  );
}

// ── Skip Setup Button ─────────────────────────────────────────────

interface SkipButtonProps {
  onPress: () => void;
}

export function SkipSetupButton({ onPress }: SkipButtonProps): JSX.Element {
  return (
    <TouchableOpacity
      style={styles.skipButton}
      onPress={onPress}
      accessible
      accessibilityRole="button"
      accessibilityLabel="Skip setup"
      accessibilityHint="Skips onboarding and goes directly to the app"
    >
      <Text style={styles.skipButtonText}>Skip Setup</Text>
    </TouchableOpacity>
  );
}

// ── Back Button ───────────────────────────────────────────────────

interface BackButtonProps {
  onPress: () => void;
}

export function BackButton({ onPress }: BackButtonProps): JSX.Element {
  return (
    <TouchableOpacity
      style={styles.backButton}
      onPress={onPress}
      accessible
      accessibilityRole="button"
      accessibilityLabel="Go back"
      accessibilityHint="Returns to the previous step"
    >
      <Text style={styles.backButtonText}>← Back</Text>
    </TouchableOpacity>
  );
}

// ── Styles ────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Primary button
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 16,
    minHeight: TOUCH_TARGETS.large,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
  },
  primaryButtonDisabled: {
    backgroundColor: colors.surface,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: fonts.button,
    fontWeight: '700',
  },
  primaryButtonTextDisabled: {
    color: colors.textSecondary,
  },

  // Secondary button
  secondaryButton: {
    minHeight: TOUCH_TARGETS.comfortable,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
  },
  secondaryButtonText: {
    color: colors.primary,
    fontSize: fonts.body,
    fontWeight: '600',
  },

  // Progress dots
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  dot: {
    borderRadius: 6,
  },
  dotActive: {
    width: 12,
    height: 12,
    backgroundColor: colors.primary,
  },
  dotInactive: {
    width: 8,
    height: 8,
    backgroundColor: colors.surface,
  },

  // Read aloud toggle
  readAloudToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: 20,
    backgroundColor: colors.surface,
  },
  readAloudToggleActive: {
    backgroundColor: colors.primary + '20',
  },
  readAloudIcon: {
    fontSize: 16,
  },
  readAloudText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  readAloudTextActive: {
    color: colors.primary,
  },

  // Icon circle
  iconCircle: {
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },

  // Skip button
  skipButton: {
    minHeight: TOUCH_TARGETS.minimum,
    justifyContent: 'center',
    alignItems: 'center',
  },
  skipButtonText: {
    color: colors.textSecondary,
    fontSize: fonts.body - 2,
    fontWeight: '500',
  },

  // Back button
  backButton: {
    minHeight: TOUCH_TARGETS.minimum,
    justifyContent: 'center',
    paddingRight: SPACING.md,
  },
  backButtonText: {
    color: colors.primary,
    fontSize: fonts.body,
    fontWeight: '600',
  },
});
