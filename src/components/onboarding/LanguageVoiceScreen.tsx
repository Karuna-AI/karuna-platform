import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSettings } from '../../context/SettingsContext';
import { ttsService } from '../../services/tts';
import { telemetryService } from '../../services/telemetry';
import { LanguageCode, getLanguageConfig } from '../../i18n/languages';
import { LanguageSelector } from '../LanguageSelector';
import { getColors, getFontSizes, SPACING } from '../../utils/accessibility';
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
  const { settings, setLanguage } = useSettings();
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  const langConfig = getLanguageConfig(settings.language);

  useEffect(() => {
    if (readAloudEnabled) {
      ttsService.speak('Choose your language. You can also test how Karuna sounds.');
    }
  }, [readAloudEnabled]);

  const handleLanguageSelect = useCallback(async (code: LanguageCode) => {
    await setLanguage(code);
    setShowLanguagePicker(false);
    telemetryService.track('onboarding_language_selected', { errorType: code });
  }, [setLanguage]);

  const handleTestVoice = useCallback(async () => {
    if (Platform.OS !== 'web') { try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {} }
    setIsTesting(true);
    const sample = getVoiceSample(settings.language);
    ttsService.speak(sample);
    telemetryService.track('onboarding_voice_tested', { errorType: settings.language });
    // Reset after a few seconds
    setTimeout(() => setIsTesting(false), 4000);
  }, [settings.language]);

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
});
