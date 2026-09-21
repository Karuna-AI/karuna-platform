/**
 * Voice input preferences for elderly users.
 *
 * Kept separate from SettingsContext (which this task is not allowed to
 * extend) as a small AsyncStorage-backed store consumed by ChatScreen,
 * VoiceButton, and SettingsScreen.
 *
 * Defaults are chosen for elderly ease-of-use:
 * - tapToTalk: true — tap once to start, tap again to stop. Holding a button
 *   while speaking is hard for arthritic hands.
 * - confirmVoiceMessage: false — voice transcripts auto-send after a short
 *   undo window. Users who want to review every message can opt back in.
 */

import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TAP_TO_TALK_KEY = '@karuna_voice_tap_to_talk';
const CONFIRM_VOICE_KEY = '@karuna_voice_confirm_before_send';

export interface VoicePreferences {
  tapToTalk: boolean;
  confirmVoiceMessage: boolean;
}

const DEFAULTS: VoicePreferences = {
  tapToTalk: true,
  confirmVoiceMessage: false,
};

async function readBool(key: string, fallback: boolean): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw === null) return fallback;
    return raw === 'true';
  } catch {
    return fallback;
  }
}

export async function getVoicePreferences(): Promise<VoicePreferences> {
  const [tapToTalk, confirmVoiceMessage] = await Promise.all([
    readBool(TAP_TO_TALK_KEY, DEFAULTS.tapToTalk),
    readBool(CONFIRM_VOICE_KEY, DEFAULTS.confirmVoiceMessage),
  ]);
  return { tapToTalk, confirmVoiceMessage };
}

export async function setTapToTalkPreference(value: boolean): Promise<void> {
  await AsyncStorage.setItem(TAP_TO_TALK_KEY, String(value));
}

export async function setConfirmVoicePreference(value: boolean): Promise<void> {
  await AsyncStorage.setItem(CONFIRM_VOICE_KEY, String(value));
}

export interface VoicePreferencesState extends VoicePreferences {
  loaded: boolean;
  setTapToTalk: (value: boolean) => Promise<void>;
  setConfirmVoiceMessage: (value: boolean) => Promise<void>;
}

export function useVoicePreferences(): VoicePreferencesState {
  const [prefs, setPrefs] = useState<VoicePreferences>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getVoicePreferences().then(p => {
      if (!cancelled) {
        setPrefs(p);
        setLoaded(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setTapToTalk = useCallback(async (value: boolean) => {
    await setTapToTalkPreference(value);
    setPrefs(p => ({ ...p, tapToTalk: value }));
  }, []);

  const setConfirmVoiceMessage = useCallback(async (value: boolean) => {
    await setConfirmVoicePreference(value);
    setPrefs(p => ({ ...p, confirmVoiceMessage: value }));
  }, []);

  return { ...prefs, loaded, setTapToTalk, setConfirmVoiceMessage };
}
