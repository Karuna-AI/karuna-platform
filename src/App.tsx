import React, { useEffect } from 'react';
import { Alert } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';

import { SettingsProvider, useSettings } from './context/SettingsContext';
import { AppStateProvider, useAppState } from './context/AppStateContext';
import { RootNavigator } from './navigation/RootNavigator';
import LockScreen from './components/LockScreen';
import { OnboardingFlow } from './components/onboarding/OnboardingFlow';

function SettingsErrorAlert(): null {
  const { settingsLoadError } = useSettings();
  useEffect(() => {
    if (settingsLoadError) {
      Alert.alert(
        'Settings Reset',
        'Your saved settings could not be loaded and have been reset to defaults. You can update them in Settings.',
        [{ text: 'OK' }]
      );
    }
  }, [settingsLoadError]);
  return null;
}

function AppShell(): JSX.Element | null {
  const {
    isOnboardingComplete,
    onOnboardingComplete,
    isAppLocked,
    isSecurityInitialized,
    onAppUnlock,
    isVaultUnlockPending,
    onVaultUnlock,
  } = useAppState();

  // Still initializing onboarding state — render nothing to avoid flash
  if (isOnboardingComplete === null) return null;

  if (!isOnboardingComplete) {
    return <OnboardingFlow onComplete={onOnboardingComplete} />;
  }

  if (isAppLocked && isSecurityInitialized) {
    return (
      <LockScreen
        onUnlock={onAppUnlock}
        title="Welcome Back"
        subtitle="Enter your PIN to unlock Karuna"
        context="app"
      />
    );
  }

  if (isVaultUnlockPending) {
    return (
      <LockScreen
        onUnlock={onVaultUnlock}
        title="Unlock Vault"
        subtitle="Enter your PIN to access your secure vault"
        context="vault"
      />
    );
  }

  return (
    <NavigationContainer>
      <RootNavigator />
    </NavigationContainer>
  );
}

export default function App(): JSX.Element {
  return (
    <SettingsProvider>
      <AppStateProvider>
        <SettingsErrorAlert />
        <AppShell />
      </AppStateProvider>
    </SettingsProvider>
  );
}
