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

export function PermissionMicScreen({
  onNext,
  readAloudEnabled,
}: OnboardingScreenProps): JSX.Element {
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    if (readAloudEnabled) {
      ttsService.speak('Karuna listens to you. Allow microphone access so you can talk instead of typing.');
    }
  }, [readAloudEnabled]);

  const handleAllow = useCallback(async () => {
    if (Platform.OS !== 'web') { try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {} }
    setRequesting(true);
    try {
      const result = await permissionsService.requestMicrophonePermission();
      const granted = result.status === 'granted';
      await onboardingStore.setPermissionResult('mic', granted);

      if (granted) {
        telemetryService.track('onboarding_permission_mic_granted');
      } else {
        telemetryService.track('onboarding_permission_mic_denied');
      }
    } catch (error) {
      console.error('Mic permission error:', error);
      telemetryService.track('onboarding_permission_mic_denied');
    }
    setRequesting(false);
    onNext();
  }, [onNext]);

  const handleTypeInstead = useCallback(async () => {
    await onboardingStore.setPermissionResult('mic', false);
    telemetryService.track('onboarding_permission_mic_skipped');
    onNext();
  }, [onNext]);

  return (
    <View style={onboardingStyles.content}>
      <IconCircle icon="🎤" />

      <Text style={onboardingStyles.title}>Karuna Listens to You</Text>
      <Text style={onboardingStyles.subtitle}>
        Just talk naturally — Karuna understands your voice
      </Text>
      <Text style={onboardingStyles.whyText}>
        Microphone access lets you talk to Karuna instead of typing
      </Text>

      <View style={onboardingStyles.bottomArea}>
        <OnboardingButton
          title={requesting ? 'Requesting...' : 'Allow Microphone'}
          onPress={handleAllow}
          disabled={requesting}
          accessibilityHint="Requests microphone access for voice interaction"
        />
        <OnboardingSecondaryButton
          title="I'll type instead"
          onPress={handleTypeInstead}
          accessibilityHint="Skips microphone and uses text input only"
        />
      </View>
    </View>
  );
}
