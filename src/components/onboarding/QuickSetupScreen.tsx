import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSettings } from '../../context/SettingsContext';
import { onboardingStore, QuickSetupData } from '../../services/onboardingStore';
import { telemetryService } from '../../services/telemetry';
import { ttsService } from '../../services/tts';
import { getColors, getFontSizes, SPACING, TOUCH_TARGETS } from '../../utils/accessibility';
import {
  OnboardingScreenProps,
  OnboardingButton,
  onboardingStyles,
} from './shared';

const colors = getColors(true);
const fonts = getFontSizes('large');
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - SPACING.lg * 2;

export function QuickSetupScreen({
  onNext,
  readAloudEnabled,
}: OnboardingScreenProps): JSX.Element {
  const { addEmergencyContact } = useSettings();
  const scrollRef = useRef<ScrollView>(null);
  const [cardIndex, setCardIndex] = useState(0);

  // Form state
  const [reminderTime, setReminderTime] = useState('08:00 AM');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [medicalNotes, setMedicalNotes] = useState('');

  useEffect(() => {
    if (readAloudEnabled) {
      ttsService.speak('Quick setup. Add a few basics to get started. Everything is optional.');
    }
  }, [readAloudEnabled]);

  const handleScroll = useCallback((event: any) => {
    const offset = event.nativeEvent.contentOffset.x;
    const index = Math.round(offset / CARD_WIDTH);
    setCardIndex(index);
  }, []);

  const goToCard = useCallback((index: number) => {
    scrollRef.current?.scrollTo({ x: index * CARD_WIDTH, animated: true });
    setCardIndex(index);
  }, []);

  const handleSaveAndContinue = useCallback(async () => {
    if (Platform.OS !== 'web') { try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {} }

    const data: QuickSetupData = {};
    if (reminderTime) data.reminderTime = reminderTime;
    if (contactName) data.trustedContactName = contactName;
    if (contactPhone) data.trustedContactPhone = contactPhone;
    if (medicalNotes) data.medicalNotes = medicalNotes;

    await onboardingStore.setQuickSetupData(data);

    // Save trusted contact to emergency contacts
    if (contactName && contactPhone) {
      addEmergencyContact({
        name: contactName,
        phoneNumber: contactPhone,
        relationship: 'Trusted Contact',
      });
    }

    telemetryService.track('onboarding_quick_setup_saved');
    onNext();
  }, [reminderTime, contactName, contactPhone, medicalNotes, addEmergencyContact, onNext]);

  const CARDS = [
    // Card 1: Reminders
    <View key="reminders" style={styles.card}>
      <Text style={styles.cardIcon}>⏰</Text>
      <Text style={styles.cardTitle}>Daily Reminder</Text>
      <Text style={styles.cardDescription}>
        When would you like Karuna to check in?
      </Text>
      <View style={styles.timePickerRow}>
        {['08:00 AM', '12:00 PM', '06:00 PM', '09:00 PM'].map((time) => (
          <TouchableOpacity
            key={time}
            style={[
              styles.timeChip,
              reminderTime === time && styles.timeChipActive,
            ]}
            onPress={() => setReminderTime(time)}
            accessible
            accessibilityRole="button"
            accessibilityLabel={time}
            accessibilityState={{ selected: reminderTime === time }}
          >
            <Text style={[
              styles.timeChipText,
              reminderTime === time && styles.timeChipTextActive,
            ]}>
              {time}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>,

    // Card 2: Trusted person
    <View key="contact" style={styles.card}>
      <Text style={styles.cardIcon}>👤</Text>
      <Text style={styles.cardTitle}>Trusted Person</Text>
      <Text style={styles.cardDescription}>
        Someone Karuna can help you reach quickly
      </Text>
      <TextInput
        style={styles.input}
        placeholder="Name"
        placeholderTextColor={colors.textSecondary}
        value={contactName}
        onChangeText={setContactName}
        accessible
        accessibilityLabel="Contact name"
      />
      <TextInput
        style={styles.input}
        placeholder="Phone number"
        placeholderTextColor={colors.textSecondary}
        value={contactPhone}
        onChangeText={setContactPhone}
        keyboardType="phone-pad"
        accessible
        accessibilityLabel="Contact phone number"
      />
    </View>,

    // Card 3: Medical basics
    <View key="medical" style={styles.card}>
      <Text style={styles.cardIcon}>💊</Text>
      <Text style={styles.cardTitle}>Medical Basics</Text>
      <Text style={styles.cardDescription}>
        Any allergies, conditions, or medications to remember?
      </Text>
      <TextInput
        style={[styles.input, styles.inputMultiline]}
        placeholder="e.g., Diabetic, allergic to penicillin..."
        placeholderTextColor={colors.textSecondary}
        value={medicalNotes}
        onChangeText={setMedicalNotes}
        multiline
        numberOfLines={3}
        accessible
        accessibilityLabel="Medical notes"
      />
    </View>,
  ];

  return (
    <KeyboardAvoidingView
      style={onboardingStyles.content}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={onboardingStyles.title}>Quick Setup</Text>
      <Text style={onboardingStyles.subtitle}>
        Add a few basics — everything is optional
      </Text>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        {CARDS.map((card, i) => (
          <View key={i} style={{ width: CARD_WIDTH }}>
            {card}
          </View>
        ))}
      </ScrollView>

      {/* Page dots */}
      <View style={styles.pageDots}>
        {CARDS.map((_, i) => (
          <TouchableOpacity
            key={i}
            onPress={() => goToCard(i)}
            accessible
            accessibilityLabel={`Go to card ${i + 1}`}
          >
            <View
              style={[
                styles.pageDot,
                i === cardIndex && styles.pageDotActive,
              ]}
            />
          </TouchableOpacity>
        ))}
      </View>

      <View style={onboardingStyles.bottomArea}>
        <OnboardingButton
          title="Continue"
          onPress={handleSaveAndContinue}
          accessibilityHint="Saves your setup and continues"
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
    marginTop: SPACING.md,
  },
  scrollContent: {
    paddingRight: SPACING.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: SPACING.lg,
    marginRight: SPACING.md,
    flex: 1,
  },
  cardIcon: {
    fontSize: 40,
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  cardTitle: {
    fontSize: fonts.header,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  cardDescription: {
    fontSize: fonts.body - 2,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.lg,
    lineHeight: (fonts.body - 2) * 1.4,
  },
  timePickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: SPACING.sm,
  },
  timeChip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: 20,
    backgroundColor: colors.background,
    borderWidth: 2,
    borderColor: 'transparent',
    minHeight: TOUCH_TARGETS.minimum,
    justifyContent: 'center',
  },
  timeChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '10',
  },
  timeChipText: {
    fontSize: fonts.body - 2,
    color: colors.text,
    fontWeight: '500',
  },
  timeChipTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  input: {
    backgroundColor: colors.background,
    borderRadius: 12,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    fontSize: fonts.body,
    color: colors.text,
    marginBottom: SPACING.md,
    minHeight: TOUCH_TARGETS.comfortable,
  },
  inputMultiline: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  pageDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
  },
  pageDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.surface,
  },
  pageDotActive: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.primary,
  },
});
