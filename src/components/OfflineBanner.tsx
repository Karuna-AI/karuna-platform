import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SPACING, getFontSizes, announceForAccessibility } from '../utils/accessibility';
import { getCurrentTranslations } from '../i18n/translations';

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
//   - #39: large bold high-contrast text, localized, and announces the moment
//     connectivity is lost.
export function OfflineBanner(): React.JSX.Element | null {
  const insets = useSafeAreaInsets();
  const fonts = getFontSizes('large');
  const t = getCurrentTranslations();
  const [isOffline, setIsOffline] = useState(false);
  const wasOfflineRef = useRef(false);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      // NetInfo reports `isConnected` (transport up) and `isInternetReachable`
      // (could actually round-trip). Treat null/false on either as offline.
      const connected = state.isConnected === true && state.isInternetReachable !== false;
      const offline = !connected;
      setIsOffline(offline);
      // #39: announce the moment connectivity is lost so VoiceOver/TalkBack
      // users know why voice features stopped working.
      if (offline && !wasOfflineRef.current) {
        announceForAccessibility(t.offline.message);
      }
      wasOfflineRef.current = offline;
    });
    return () => {
      unsubscribe();
    };
  }, [t]);

  if (!isOffline) return null;

  return (
    <View
      style={[
        styles.banner,
        {
          // #39: dark amber keeps white bold text at high contrast in every
          // theme (the standard warning orange is too light for white text).
          backgroundColor: '#7A4A00',
          paddingTop: insets.top + SPACING.xs,
        },
      ]}
      accessible={true}
      accessibilityRole="alert"
      accessibilityLabel={t.offline.message}
      accessibilityLiveRegion={Platform.OS === 'android' ? 'polite' : undefined}
    >
      <Text style={[styles.text, { fontSize: Math.max(18, fonts.bodyLarge) }]}>
        📶 {t.offline.message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.sm,
    minHeight: 48,
    justifyContent: 'center',
  },
  text: {
    color: '#FFFFFF',
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 24,
  },
});
