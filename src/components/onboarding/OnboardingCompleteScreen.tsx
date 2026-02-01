import React, { useEffect, useCallback, useState } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { onboardingStore } from '../../services/onboardingStore';
import { ttsService } from '../../services/tts';
import { getColors, getFontSizes, SPACING } from '../../utils/accessibility';
import {
  OnboardingScreenProps,
  OnboardingButton,
  IconCircle,
  onboardingStyles,
} from './shared';

const colors = getColors(true);
const fonts = getFontSizes('large');

interface OnboardingCompleteScreenProps extends OnboardingScreenProps {
  onComplete: () => void;
}

export function OnboardingCompleteScreen({
  onComplete,
  readAloudEnabled,
}: OnboardingCompleteScreenProps): JSX.Element {
  const [summary, setSummary] = useState<string[]>([]);

  useEffect(() => {
    buildSummary();
    if (Platform.OS !== 'web') { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); }
  }, []);

  useEffect(() => {
    if (readAloudEnabled) {
      ttsService.speak("You're all set! Tap Start Talking to begin using Karuna.");
    }
  }, [readAloudEnabled]);

  const buildSummary = async () => {
    const items: string[] = [];
    const role = onboardingStore.getRole();
    items.push(role === 'caregiver' ? 'Caregiver mode' : 'Personal mode');

    const security = await onboardingStore.getSecurityMethod();
    if (security === 'biometric') items.push('Biometric lock enabled');
    else if (security === 'pin') items.push('PIN lock enabled');

    const quickSetup = await onboardingStore.getQuickSetupData();
    if (quickSetup) {
      if (quickSetup.reminderTime) items.push(`Daily reminder at ${quickSetup.reminderTime}`);
      if (quickSetup.trustedContactName) items.push(`Trusted contact: ${quickSetup.trustedContactName}`);
    }

    setSummary(items);
  };

  const handleStart = useCallback(async () => {
    if (Platform.OS !== 'web') { try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {} }
    onComplete();
  }, [onComplete]);

  return (
    <View style={onboardingStyles.content}>
      <IconCircle icon="✅" color={colors.success} />

      <Text style={onboardingStyles.title}>You're All Set!</Text>
      <Text style={onboardingStyles.subtitle}>
        Karuna is ready to help you
      </Text>

      {summary.length > 0 && (
        <View style={styles.summaryBox}>
          {summary.map((item, i) => (
            <Text key={i} style={styles.summaryItem}>
              ✓ {item}
            </Text>
          ))}
        </View>
      )}

      <View style={onboardingStyles.bottomArea}>
        <OnboardingButton
          title="Start Talking"
          onPress={handleStart}
          accessibilityHint="Completes setup and opens Karuna"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  summaryBox: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: SPACING.lg,
    marginTop: SPACING.xl,
    width: '100%',
    gap: SPACING.sm,
  },
  summaryItem: {
    fontSize: fonts.body,
    color: colors.text,
    lineHeight: fonts.body * 1.5,
  },
});
