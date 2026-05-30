import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useTheme } from '../context/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SPACING, getFontSizes } from '../utils/accessibility';

// Persistent, non-dismissible banner shown at the top of every screen while
// the device has no network reachability. Karuna's primary actions (chat,
// recording, sync) all depend on the gateway; without this, an elderly user
// just sees opaque "Could not start recording" red banners and doesn't know
// to check their WiFi.
//
// Behavior:
//   - Mounts a NetInfo subscription on first render; tears it down on unmount.
//   - Treats both "no connection" and "connected but no internet" as offline.
//   - Sits above the status bar's safe area so it never overlaps system chrome.
export function OfflineBanner(): JSX.Element | null {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const fonts = getFontSizes('large');
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      // NetInfo reports `isConnected` (transport up) and `isInternetReachable`
      // (could actually round-trip). Treat null/false on either as offline.
      const connected = state.isConnected === true && state.isInternetReachable !== false;
      setIsOffline(!connected);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  if (!isOffline) return null;

  return (
    <View
      style={[
        styles.banner,
        {
          backgroundColor: colors.warning,
          paddingTop: insets.top + SPACING.xs,
        },
      ]}
      accessibilityRole="alert"
      accessibilityLabel="You're offline. Voice and care-circle features will resume when you reconnect."
      accessibilityLiveRegion={Platform.OS === 'android' ? 'polite' : undefined}
    >
      <Text style={[styles.text, { fontSize: fonts.bodySmall }]}>
        You're offline — voice and sync will resume when you reconnect.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  text: {
    color: '#FFFFFF',
    fontWeight: '600',
    textAlign: 'center',
  },
});
