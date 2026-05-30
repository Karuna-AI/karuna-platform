import React, { useEffect } from 'react';
import { Alert } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { SettingsProvider, useSettings } from './context/SettingsContext';
import { ThemeProvider } from './context/ThemeContext';
import { OfflineBanner } from './components/OfflineBanner';
import { View } from 'react-native';
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

  // Compute body once; OfflineBanner overlays above all variants so the
  // user always sees the connectivity hint regardless of which screen
  // mode is active.
  let body: JSX.Element;
  if (!isOnboardingComplete) {
    body = <OnboardingFlow onComplete={onOnboardingComplete} />;
  } else if (isAppLocked && isSecurityInitialized) {
    body = (
      <LockScreen
        onUnlock={onAppUnlock}
        title="Welcome Back"
        subtitle="Enter your PIN to unlock Karuna"
        context="app"
      />
    );
  } else if (isVaultUnlockPending) {
    body = (
      <LockScreen
        onUnlock={onVaultUnlock}
        title="Unlock Vault"
        subtitle="Enter your PIN to access your secure vault"
        context="vault"
      />
    );
  } else {
    body = (
      <NavigationContainer>
        <RootNavigator />
      </NavigationContainer>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <OfflineBanner />
      {body}
    </View>
  );
}

// Small connector that pipes the user's highContrast preference from
// SettingsContext into ThemeProvider's prop. Kept separate so ThemeContext
// doesn't have to import SettingsContext directly (that coupling caused a
// jest.mock'd AsyncStorage recursion in component tests).
function ThemedProviders({ children }: { children: React.ReactNode }) {
  const { settings } = useSettings();
  return <ThemeProvider highContrast={settings.highContrast}>{children}</ThemeProvider>;
}

export default function App(): JSX.Element {
  // GestureHandlerRootView is required by @react-navigation/native-stack and
  // react-native-screens for touch propagation. SafeAreaProvider is required
  // by react-native-safe-area-context's SafeAreaView / useSafeAreaInsets() to
  // expose system insets to every screen (status bar, gesture pill, notch).
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <SettingsProvider>
          <ThemedProviders>
            <AppStateProvider>
              <SettingsErrorAlert />
              <AppShell />
            </AppStateProvider>
          </ThemedProviders>
        </SettingsProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
