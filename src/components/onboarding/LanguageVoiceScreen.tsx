import React, { useState, useEffect, useCallback } from 'react';
import type { JSX } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSettings } from '../../context/SettingsContext';
import { SpeechRate } from '../../context/SettingsContext';
import { ttsService } from '../../services/tts';
import { telemetryService } from '../../services/telemetry';
import { LanguageCode, getLanguageConfig } from '../../i18n/languages';
import { LanguageSelector } from '../LanguageSelector';
import { getColors, getFontSizes, SPACING, TOUCH_TARGETS } from '../../utils/accessibility';
import {
  OnboardingScreenProps,
  OnboardingButton,
  OnboardingSecondaryButton,
  IconCircle,
  onboardingStyles,
} from './shared';

const colors = getColors(true);
const fonts = getFontSizes('large');

const VOICE_SAMPLES: Record<string, string> = {
  en: 'Hello! I am Karuna, your voice companion. I can help you with reminders, calls, and more.',
  hi: 'नमस्ते! मैं करुणा हूँ, आपकी आवाज़ साथी। मैं आपकी याद दिलाने, कॉल करने और बहुत कुछ में मदद कर सकती हूँ।',
  ta: 'வணக்கம்! நான் கருணா, உங்கள் குரல் துணை. நினைவூட்டல்கள், அழைப்புகள் மற்றும் பலவற்றில் உதவ முடியும்.',
  te: 'నమస్కారం! నేను కరుణా, మీ వాయిస్ తోడు. రిమైండర్లు, కాల్స్ మరియు మరిన్నింటిలో సహాయం చేయగలను.',
};

function getVoiceSample(lang: LanguageCode): string {
  return VOICE_SAMPLES[lang] || VOICE_SAMPLES.en;
}

export function LanguageVoiceScreen({
  onNext,
  readAloudEnabled,
}: OnboardingScreenProps): JSX.Element {
  const { settings, setLanguage, setSpeechRate } = useSettings();
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  const langConfig = getLanguageConfig(settings.language);

  useEffect(() => {
    if (readAloudEnabled) {
      ttsService.speak('Choose your language. You can also test how Karuna sounds.').catch(() => {
        // Error already surfaced via onSpeakError.
      });
    }
  }, [readAloudEnabled]);

  const handleLanguageSelect = useCallback(async (code: LanguageCode) => {
    await setLanguage(code);
    setShowLanguagePicker(false);
    telemetryService.track('onboarding_language_selected', { language: code });
  }, [setLanguage]);

  const handleTestVoice = useCallback(async () => {
    if (Platform.OS !== 'web') { try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch { /* intentionally empty */ } }
    setIsTesting(true);
    const sample = getVoiceSample(settings.language);
    ttsService.speak(sample).catch(() => {
      // Error already surfaced via onSpeakError.
    });
    telemetryService.track('onboarding_voice_tested', { errorType: settings.language });
    // Reset after a few seconds
    setTimeout(() => setIsTesting(false), 4000);
  }, [settings.language]);

  // #31: speech-speed choice — Slow (0.6) is the elderly-friendly default.
  const handleSpeedSelect = useCallback(async (rate: SpeechRate) => {
    if (Platform.OS !== 'web') { try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch { /* intentionally empty */ } }
    await setSpeechRate(rate);
    telemetryService.track('onboarding_speech_speed_selected', { rate });
  }, [setSpeechRate]);

  const handleNext = useCallback(() => {
    ttsService.stop();
    onNext();
  }, [onNext]);

  return (
    <View style={onboardingStyles.content}>
      <IconCircle icon="🌐" />

      <Text style={onboardingStyles.title}>Choose Your Language</Text>
      <Text style={onboardingStyles.subtitle}>
        Karuna will speak and listen in your language
      </Text>

      {/* Current language display */}
      <View style={styles.languageDisplay}>
        <Text style={styles.languageNative}>{langConfig.nativeName}</Text>
        <Text style={styles.languageName}>{langConfig.name}</Text>
      </View>

      {/* Action buttons */}
      <View style={styles.actions}>
        <OnboardingSecondaryButton
          title="Change Language"
          onPress={() => setShowLanguagePicker(true)}
          accessibilityHint="Opens the language picker"
        />

        <OnboardingButton
          title={isTesting ? 'Playing...' : '🔊 Test Voice'}
          onPress={handleTestVoice}
          disabled={isTesting}
          accessibilityLabel="Test voice"
          accessibilityHint="Plays a sample of how Karuna sounds in your language"
          style={styles.testButton}
        />
      </View>

      {/* #31: speech speed — Slow is best for most users */}
      <View style={styles.speedSection}>
        <Text style={styles.speedLabel}>How fast should Karuna speak?</Text>
        <View style={styles.speedRow}>
          {(
            [
              { label: 'Slow', rate: 0.6 },
              { label: 'Normal', rate: 0.8 },
              { label: 'Fast', rate: 1.0 },
            ] as { label: string; rate: SpeechRate }[]
          ).map((option) => {
            const selected = settings.speechRate === option.rate;
            return (
              <TouchableOpacity
                key={option.label}
                style={[styles.speedChip, selected && styles.speedChipActive]}
                onPress={() => handleSpeedSelect(option.rate)}
                accessible
                accessibilityRole="button"
                accessibilityLabel={`Speech speed: ${option.label}`}
                accessibilityState={{ selected }}
              >
                <Text
                  style={[styles.speedChipText, selected && styles.speedChipTextActive]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Next button at bottom */}
      <View style={onboardingStyles.bottomArea}>
        <OnboardingButton
          title="Next"
          onPress={handleNext}
          accessibilityHint="Continue to the next step"
        />
      </View>

      {/* Language picker modal */}
      <LanguageSelector
        visible={showLanguagePicker}
        currentLanguage={settings.language}
        onSelect={handleLanguageSelect}
        onClose={() => setShowLanguagePicker(false)}
        fontSize={fonts.body}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  languageDisplay: {
    alignItems: 'center',
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.lg,
    backgroundColor: colors.surface,
    borderRadius: 16,
    marginTop: SPACING.lg,
    width: '100%',
  },
  languageNative: {
    fontSize: fonts.headerLarge,
    fontWeight: '700',
    color: colors.text,
  },
  languageName: {
    fontSize: fonts.body,
    color: colors.textSecondary,
    marginTop: SPACING.xs,
  },
  actions: {
    width: '100%',
    gap: SPACING.md,
    marginTop: SPACING.lg,
  },
  testButton: {
    backgroundColor: colors.surface,
  },
  speedSection: {
    width: '100%',
    marginTop: SPACING.lg,
    alignItems: 'center',
  },
  speedLabel: {
    fontSize: fonts.body,
    fontWeight: '600',
    color: colors.text,
    marginBottom: SPACING.sm,
  },
  speedRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  speedChip: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: 'transparent',
    minHeight: TOUCH_TARGETS.minimum,
    justifyContent: 'center',
  },
  speedChipActive: {
    borderColor: colors.primary,
  },
  speedChipText: {
    fontSize: fonts.body,
    color: colors.text,
    fontWeight: '500',
  },
  speedChipTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
});
