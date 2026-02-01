import React, { useEffect, useCallback, useState } from 'react';
import { View, Text, Share, StyleSheet, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as Crypto from 'expo-crypto';
import { telemetryService } from '../../services/telemetry';
import { ttsService } from '../../services/tts';
import { getColors, getFontSizes, SPACING } from '../../utils/accessibility';
import {
  OnboardingScreenProps,
  OnboardingButton,
  OnboardingSecondaryButton,
  IconCircle,
  onboardingStyles,
} from './shared';

const colors = getColors(true);
const fonts = getFontSizes('large');

async function generateInviteCode(): Promise<string> {
  try {
    const bytes = await Crypto.getRandomBytesAsync(6);
    return Array.from(bytes)
      .map((b) => b.toString(36).padStart(2, '0'))
      .join('')
      .slice(0, 8)
      .toUpperCase();
  } catch {
    return Math.random().toString(36).slice(2, 10).toUpperCase();
  }
}

export function CaregiverInviteScreen({
  onNext,
  readAloudEnabled,
}: OnboardingScreenProps): JSX.Element {
  const [inviteCode, setInviteCode] = useState('');
  const [shared, setShared] = useState(false);

  useEffect(() => {
    generateInviteCode().then(setInviteCode);
  }, []);

  useEffect(() => {
    if (readAloudEnabled) {
      ttsService.speak('Invite a caregiver. Share a link so your family member can connect with you on Karuna.');
    }
  }, [readAloudEnabled]);

  const handleShare = useCallback(async () => {
    if (Platform.OS !== 'web') { try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {} }
    try {
      const inviteUrl = `https://karunaapp.in/invite?code=${inviteCode}`;
      const result = await Share.share({
        title: 'Join me on Karuna',
        message: `I'd like you to join my care circle on Karuna. Use this link to get started: ${inviteUrl}`,
      });

      if (result?.action === Share.sharedAction) {
        setShared(true);
        telemetryService.track('onboarding_caregiver_invite_shared');
      }
    } catch (error) {
      console.error('Share error:', error);
    }
  }, [inviteCode]);

  const handleLater = useCallback(() => {
    telemetryService.track('onboarding_caregiver_invite_skipped');
    onNext();
  }, [onNext]);

  return (
    <View style={onboardingStyles.content}>
      <IconCircle icon="💌" />

      <Text style={onboardingStyles.title}>Invite a Caregiver</Text>
      <Text style={onboardingStyles.subtitle}>
        Share a link so your family can connect with you on Karuna
      </Text>

      {inviteCode ? (
        <View style={styles.codeBox}>
          <Text style={styles.codeLabel}>Your invite code</Text>
          <Text
            style={styles.codeText}
            accessible
            accessibilityLabel={`Invite code: ${inviteCode.split('').join(' ')}`}
          >
            {inviteCode}
          </Text>
        </View>
      ) : null}

      {shared && (
        <View style={styles.successBadge}>
          <Text style={styles.successText}>✓ Invite shared!</Text>
        </View>
      )}

      <View style={onboardingStyles.bottomArea}>
        <OnboardingButton
          title={shared ? 'Share Again' : 'Share Invite Link'}
          onPress={handleShare}
          accessibilityHint="Opens share dialog to send the invite link"
        />
        <OnboardingSecondaryButton
          title={shared ? 'Continue' : "I'll do this later"}
          onPress={shared ? onNext : handleLater}
          accessibilityHint={shared ? 'Continues to the next step' : 'Skips caregiver invite'}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  codeBox: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: SPACING.lg,
    alignItems: 'center',
    marginTop: SPACING.xl,
    width: '100%',
  },
  codeLabel: {
    fontSize: fonts.body - 2,
    color: colors.textSecondary,
    marginBottom: SPACING.sm,
  },
  codeText: {
    fontSize: fonts.headerLarge,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 4,
  },
  successBadge: {
    backgroundColor: colors.success + '15',
    borderRadius: 12,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    marginTop: SPACING.md,
  },
  successText: {
    color: colors.success,
    fontSize: fonts.body,
    fontWeight: '600',
  },
});
