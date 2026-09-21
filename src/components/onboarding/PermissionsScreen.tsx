import React, { useEffect, useCallback, useState } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { permissionsService } from '../../services/permissions';
import { onboardingStore } from '../../services/onboardingStore';
import { telemetryService } from '../../services/telemetry';
import { ttsService } from '../../services/tts';
import { getColors, getFontSizes, SPACING, TOUCH_TARGETS } from '../../utils/accessibility';
import {
  OnboardingScreenProps,
  OnboardingButton,
  OnboardingSecondaryButton,
  onboardingStyles,
} from './shared';

const colors = getColors(true);
const fonts = getFontSizes('large');

type PermissionKey = 'mic' | 'notify';

interface PermissionRow {
  key: PermissionKey;
  icon: string;
  title: string;
  description: string;
  allowLabel: string;
}

const ROWS: PermissionRow[] = [
  {
    key: 'mic',
    icon: '🎤',
    title: 'Microphone',
    description: 'Lets you talk to Karuna instead of typing',
    allowLabel: 'Allow Microphone',
  },
  {
    key: 'notify',
    icon: '🔔',
    title: 'Notifications',
    description: 'Reminders for medications, appointments, and check-ins',
    allowLabel: 'Allow Notifications',
  },
];

/**
 * #13: microphone + notifications merged into a single "Permissions" step.
 * Each permission is requested independently; Continue works even if one
 * or both are skipped.
 */
export function PermissionsScreen({
  onNext,
  readAloudEnabled,
}: OnboardingScreenProps): JSX.Element {
  const [granted, setGranted] = useState<Record<PermissionKey, boolean>>({
    mic: false,
    notify: false,
  });
  const [decided, setDecided] = useState<Record<PermissionKey, boolean>>({
    mic: false,
    notify: false,
  });
  const [requesting, setRequesting] = useState<PermissionKey | null>(null);

  useEffect(() => {
    if (readAloudEnabled) {
      ttsService.speak(
        'Karuna needs your permission for two things. Microphone, so you can talk instead of typing. And notifications, for medication and appointment reminders. You can skip either one.'
      ).catch(() => {
        // Error already surfaced via onSpeakError.
      });
    }
  }, [readAloudEnabled]);

  const handleAllow = useCallback(async (key: PermissionKey) => {
    if (Platform.OS !== 'web') {
      try {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {
        /* intentionally empty */
      }
    }
    setRequesting(key);
    try {
      const result =
        key === 'mic'
          ? await permissionsService.requestMicrophonePermission()
          : await permissionsService.requestNotificationPermission();
      const isGranted = result.status === 'granted';
      await onboardingStore.setPermissionResult(key, isGranted);
      setGranted((prev) => ({ ...prev, [key]: isGranted }));
      setDecided((prev) => ({ ...prev, [key]: true }));
      telemetryService.track(
        `onboarding_permission_${key}_${isGranted ? 'granted' : 'denied'}`
      );
    } catch (error) {
      console.error(`${key} permission error:`, error);
      telemetryService.track(`onboarding_permission_${key}_denied`);
      setDecided((prev) => ({ ...prev, [key]: true }));
    }
    setRequesting(null);
  }, []);

  const handleContinue = useCallback(async () => {
    if (Platform.OS !== 'web') {
      try {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {
        /* intentionally empty */
      }
    }
    onNext();
  }, [onNext]);

  const handleSkipAll = useCallback(async () => {
    await Promise.all([
      onboardingStore.setPermissionResult('mic', false),
      onboardingStore.setPermissionResult('notify', false),
    ]);
    telemetryService.track('onboarding_permissions_skipped');
    onNext();
  }, [onNext]);

  const allDecided = decided.mic && decided.notify;

  return (
    <View style={onboardingStyles.content}>
      <Text style={onboardingStyles.title}>Two Quick Permissions</Text>
      <Text style={onboardingStyles.subtitle}>
        You can skip either one — Karuna will still work
      </Text>

      <View style={styles.rows}>
        {ROWS.map((row) => {
          const isGranted = granted[row.key];
          const isDecided = decided[row.key];
          const isRequesting = requesting === row.key;
          return (
            <View key={row.key} style={styles.row}>
              <Text style={styles.rowIcon}>{row.icon}</Text>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{row.title}</Text>
                <Text style={styles.rowDescription}>{row.description}</Text>
              </View>
              {isGranted ? (
                <Text
                  style={styles.grantedText}
                  accessible
                  accessibilityLabel={`${row.title} permission granted`}
                >
                  ✓ On
                </Text>
              ) : isDecided ? (
                <Text style={styles.skippedText}>Skipped</Text>
              ) : (
                <OnboardingButton
                  title={isRequesting ? 'Requesting...' : 'Allow'}
                  onPress={() => handleAllow(row.key)}
                  disabled={requesting !== null}
                  accessibilityLabel={row.allowLabel}
                  accessibilityHint={row.description}
                  style={styles.allowButton}
                />
              )}
            </View>
          );
        })}
      </View>

      <View style={onboardingStyles.bottomArea}>
        <OnboardingButton
          title="Continue"
          onPress={handleContinue}
          accessibilityHint={
            allDecided
              ? 'Continues to the next step'
              : 'Continues without the remaining permissions'
          }
        />
        {!allDecided && (
          <OnboardingSecondaryButton
            title="Skip both for now"
            onPress={handleSkipAll}
            accessibilityHint="Skips microphone and notifications and continues"
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rows: {
    width: '100%',
    marginTop: SPACING.xl,
    gap: SPACING.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: SPACING.md,
    minHeight: TOUCH_TARGETS.large,
    gap: SPACING.md,
  },
  rowIcon: {
    fontSize: 36,
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontSize: fonts.bodyLarge,
    fontWeight: '700',
    color: colors.text,
  },
  rowDescription: {
    fontSize: fonts.body,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: fonts.body * 1.4,
  },
  allowButton: {
    minHeight: TOUCH_TARGETS.comfortable,
    paddingHorizontal: SPACING.lg,
  },
  grantedText: {
    fontSize: fonts.body,
    fontWeight: '700',
    color: colors.success,
    paddingHorizontal: SPACING.sm,
  },
  skippedText: {
    fontSize: fonts.body,
    fontWeight: '600',
    color: colors.textSecondary,
    paddingHorizontal: SPACING.sm,
  },
});
