import React, { useEffect, useCallback, useState } from 'react';
import { View, Text, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { permissionsService } from '../../services/permissions';
import { onboardingStore } from '../../services/onboardingStore';
import { telemetryService } from '../../services/telemetry';
import { ttsService } from '../../services/tts';
import {
  OnboardingScreenProps,
  OnboardingButton,
  OnboardingSecondaryButton,
  IconCircle,
  onboardingStyles,
} from './shared';

export function PermissionNotifyScreen({
  onNext,
  readAloudEnabled,
}: OnboardingScreenProps): JSX.Element {
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    if (readAloudEnabled) {
      ttsService.speak('Stay on track. Notifications remind you about medications, appointments, and check-ins.');
    }
  }, [readAloudEnabled]);

  const handleAllow = useCallback(async () => {
    if (Platform.OS !== 'web') { try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {} }
    setRequesting(true);
    try {
      const result = await permissionsService.requestNotificationPermission();
      const granted = result.status === 'granted';
      await onboardingStore.setPermissionResult('notify', granted);

      if (granted) {
        telemetryService.track('onboarding_permission_notify_granted');
      } else {
        telemetryService.track('onboarding_permission_notify_denied');
      }
    } catch (error) {
      console.error('Notification permission error:', error);
      telemetryService.track('onboarding_permission_notify_denied');
    }
    setRequesting(false);
    onNext();
  }, [onNext]);

  const handleNotNow = useCallback(async () => {
    await onboardingStore.setPermissionResult('notify', false);
    telemetryService.track('onboarding_permission_notify_skipped');
    onNext();
  }, [onNext]);

  return (
    <View style={onboardingStyles.content}>
      <IconCircle icon="🔔" />

      <Text style={onboardingStyles.title}>Stay on Track</Text>
      <Text style={onboardingStyles.subtitle}>
        Never miss a medication or appointment
      </Text>
      <Text style={onboardingStyles.whyText}>
        Notifications remind you about medications, appointments, and check-ins
      </Text>

      <View style={onboardingStyles.bottomArea}>
        <OnboardingButton
          title={requesting ? 'Requesting...' : 'Allow Notifications'}
          onPress={handleAllow}
          disabled={requesting}
          accessibilityHint="Allows Karuna to send you reminders"
        />
        <OnboardingSecondaryButton
          title="Not now"
          onPress={handleNotNow}
          accessibilityHint="Skips notification permission for now"
        />
      </View>
    </View>
  );
}
