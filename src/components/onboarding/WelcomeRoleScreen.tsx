import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { OnboardingRole } from '../../services/onboardingStore';
import { ttsService } from '../../services/tts';
import { getColors, getFontSizes, SPACING, TOUCH_TARGETS } from '../../utils/accessibility';
import { OnboardingScreenProps, SkipSetupButton, ReadAloudToggle } from './shared';

const colors = getColors(true);
const fonts = getFontSizes('large');

interface WelcomeRoleScreenProps extends OnboardingScreenProps {
  onRoleSelected: (role: OnboardingRole) => void;
}

export function WelcomeRoleScreen({
  onRoleSelected,
  onSkip,
  readAloudEnabled,
  onToggleReadAloud,
}: WelcomeRoleScreenProps): JSX.Element {
  useEffect(() => {
    if (readAloudEnabled) {
      ttsService.speak('Welcome to Karuna. Your voice-first companion. Choose how you would like to get started.');
    }
  }, [readAloudEnabled]);

  const handleSelect = async (role: OnboardingRole) => {
    if (Platform.OS !== 'web') { try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {} }
    onRoleSelected(role);
  };

  return (
    <View style={styles.container}>
      {/* Top controls */}
      <View style={styles.topBar}>
        <View style={{ flex: 1 }} />
        <ReadAloudToggle enabled={readAloudEnabled} onToggle={onToggleReadAloud} />
      </View>

      {/* Logo / brand area */}
      <View style={styles.brandArea}>
        <View style={styles.logoCircle}>
          <Text style={styles.logoText}>K</Text>
        </View>
        <Text style={styles.title}>Welcome to Karuna</Text>
        <Text style={styles.subtitle}>Your voice-first companion</Text>
      </View>

      {/* Role selection cards */}
      <View style={styles.cardsArea}>
        <Text style={styles.prompt}>How would you like to get started?</Text>

        <TouchableOpacity
          style={styles.roleCard}
          onPress={() => handleSelect('self')}
          accessible
          accessibilityRole="button"
          accessibilityLabel="Setting up for myself"
          accessibilityHint="Choose this if you will use Karuna yourself"
        >
          <Text style={styles.roleIcon}>👤</Text>
          <View style={styles.roleCardContent}>
            <Text style={styles.roleTitle}>Setting up for myself</Text>
            <Text style={styles.roleDescription}>I want Karuna to help me daily</Text>
          </View>
          <Text style={styles.arrow}>→</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.roleCard}
          onPress={() => handleSelect('caregiver')}
          accessible
          accessibilityRole="button"
          accessibilityLabel="I'm helping someone"
          accessibilityHint="Choose this if you are setting up Karuna for a family member"
        >
          <Text style={styles.roleIcon}>👥</Text>
          <View style={styles.roleCardContent}>
            <Text style={styles.roleTitle}>I'm helping someone</Text>
            <Text style={styles.roleDescription}>Setting up for a family member</Text>
          </View>
          <Text style={styles.arrow}>→</Text>
        </TouchableOpacity>
      </View>

      {/* Skip at bottom */}
      <View style={styles.bottomArea}>
        <SkipSetupButton onPress={onSkip} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingTop: SPACING.md,
    paddingHorizontal: SPACING.sm,
  },
  brandArea: {
    alignItems: 'center',
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.lg,
  },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  logoText: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  title: {
    fontSize: fonts.headerLarge,
    fontWeight: 'bold',
    color: colors.text,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: fonts.bodyLarge,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: SPACING.xs,
  },
  cardsArea: {
    flex: 1,
    paddingHorizontal: SPACING.sm,
  },
  prompt: {
    fontSize: fonts.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.lg,
  },
  roleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    minHeight: TOUCH_TARGETS.large,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  roleIcon: {
    fontSize: 32,
    marginRight: SPACING.md,
  },
  roleCardContent: {
    flex: 1,
  },
  roleTitle: {
    fontSize: fonts.bodyLarge,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 2,
  },
  roleDescription: {
    fontSize: fonts.body - 2,
    color: colors.textSecondary,
  },
  arrow: {
    fontSize: fonts.bodyLarge,
    color: colors.primary,
    fontWeight: '600',
  },
  bottomArea: {
    alignItems: 'center',
    paddingVertical: SPACING.md,
  },
});
