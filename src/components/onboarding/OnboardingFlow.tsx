import React, { useState, useCallback, useEffect } from 'react';
import { SafeAreaView, View, Alert } from 'react-native';
import { onboardingStore, OnboardingStep, OnboardingRole } from '../../services/onboardingStore';
import { telemetryService } from '../../services/telemetry';
import { ttsService } from '../../services/tts';
import {
  ProgressDots,
  ReadAloudToggle,
  BackButton,
  SkipSetupButton,
  onboardingStyles as styles,
} from './shared';
import { WelcomeRoleScreen } from './WelcomeRoleScreen';
import { LanguageVoiceScreen } from './LanguageVoiceScreen';
import { PermissionMicScreen } from './PermissionMicScreen';
import { PermissionNotifyScreen } from './PermissionNotifyScreen';
import { SecuritySetupScreen } from './SecuritySetupScreen';
import { QuickSetupScreen } from './QuickSetupScreen';
import { CaregiverInviteScreen } from './CaregiverInviteScreen';
import { VoiceTutorialScreen } from './VoiceTutorialScreen';
import { OnboardingCompleteScreen } from './OnboardingCompleteScreen';

interface OnboardingFlowProps {
  onComplete: () => void;
}

export function OnboardingFlow({ onComplete }: OnboardingFlowProps): JSX.Element {
  const [role, setRole] = useState<OnboardingRole>(onboardingStore.getRole());
  const [steps, setSteps] = useState<OnboardingStep[]>(onboardingStore.getStepsForRole(role));
  const [currentIndex, setCurrentIndex] = useState(0);
  const [readAloudEnabled, setReadAloudEnabled] = useState(false);

  // Restore saved step position on mount
  useEffect(() => {
    const savedStep = onboardingStore.getCurrentStep();
    const savedRole = onboardingStore.getRole();
    const stepList = onboardingStore.getStepsForRole(savedRole);
    const idx = stepList.indexOf(savedStep);
    if (idx > 0) {
      setRole(savedRole);
      setSteps(stepList);
      setCurrentIndex(idx);
    }
    telemetryService.track('onboarding_started');
  }, []);

  const currentStep = steps[currentIndex];

  const handleNext = useCallback(async () => {
    const nextIndex = currentIndex + 1;
    if (nextIndex >= steps.length) {
      // Should not happen -- OnboardingCompleteScreen calls onComplete directly
      return;
    }
    setCurrentIndex(nextIndex);
    await onboardingStore.setStep(steps[nextIndex]);
  }, [currentIndex, steps]);

  const handleBack = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  }, [currentIndex]);

  const handleRoleSelected = useCallback(async (selectedRole: OnboardingRole) => {
    setRole(selectedRole);
    const newSteps = onboardingStore.getStepsForRole(selectedRole);
    setSteps(newSteps);
    await onboardingStore.setRole(selectedRole);
    telemetryService.track('onboarding_role_selected', { errorType: selectedRole });
    // Move to next step
    setCurrentIndex(1);
    await onboardingStore.setStep(newSteps[1]);
  }, []);

  const handleSkip = useCallback(() => {
    Alert.alert(
      'Skip Setup?',
      'You can always configure these later in Settings.',
      [
        { text: 'Continue Setup', style: 'cancel' },
        {
          text: 'Skip',
          onPress: async () => {
            telemetryService.track('onboarding_skipped');
            await onboardingStore.markComplete(true);
            onComplete();
          },
        },
      ]
    );
  }, [onComplete]);

  const handleComplete = useCallback(async () => {
    telemetryService.track('onboarding_completed');
    await onboardingStore.markComplete(false);
    onComplete();
  }, [onComplete]);

  const toggleReadAloud = useCallback(() => {
    setReadAloudEnabled((prev) => {
      if (prev) ttsService.stop();
      return !prev;
    });
  }, []);

  // Common props passed to every screen
  const screenProps = {
    onNext: handleNext,
    onBack: handleBack,
    onSkip: handleSkip,
    readAloudEnabled,
    onToggleReadAloud: toggleReadAloud,
  };

  const renderCurrentScreen = () => {
    switch (currentStep) {
      case 'welcome_role':
        return <WelcomeRoleScreen {...screenProps} onRoleSelected={handleRoleSelected} />;
      case 'language_voice':
        return <LanguageVoiceScreen {...screenProps} />;
      case 'permission_mic':
        return <PermissionMicScreen {...screenProps} />;
      case 'permission_notify':
        return <PermissionNotifyScreen {...screenProps} />;
      case 'security_setup':
        return <SecuritySetupScreen {...screenProps} />;
      case 'quick_setup':
        return <QuickSetupScreen {...screenProps} />;
      case 'caregiver_invite':
        return <CaregiverInviteScreen {...screenProps} />;
      case 'voice_tutorial':
        return <VoiceTutorialScreen {...screenProps} />;
      case 'complete':
        return <OnboardingCompleteScreen {...screenProps} onComplete={handleComplete} />;
      default:
        return <WelcomeRoleScreen {...screenProps} onRoleSelected={handleRoleSelected} />;
    }
  };

  // Don't show header/progress on welcome or complete screen
  const showHeader = currentStep !== 'welcome_role' && currentStep !== 'complete';

  return (
    <SafeAreaView style={styles.safeArea}>
      {showHeader && (
        <View style={styles.header}>
          <BackButton onPress={handleBack} />
          <ProgressDots total={steps.length} current={currentIndex} />
          <ReadAloudToggle enabled={readAloudEnabled} onToggle={toggleReadAloud} />
        </View>
      )}
      <View style={styles.container}>
        {renderCurrentScreen()}
      </View>
      {showHeader && (
        <View style={{ alignItems: 'center', paddingBottom: 8 }}>
          <SkipSetupButton onPress={handleSkip} />
        </View>
      )}
    </SafeAreaView>
  );
}
