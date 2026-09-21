import React, { useEffect, useCallback, useState } from 'react';
import type { JSX } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSettings } from '../../context/SettingsContext';
import { onboardingStore, QuickSetupData } from '../../services/onboardingStore';
import { ttsService } from '../../services/tts';
import { getColors, getFontSizes, SPACING, TOUCH_TARGETS } from '../../utils/accessibility';
import {
  OnboardingScreenProps,
  OnboardingButton,
  IconCircle,
  onboardingStyles,
} from './shared';

const colors = getColors(true);
const fonts = getFontSizes('large');

interface OnboardingCompleteScreenProps extends OnboardingScreenProps {
  onComplete: () => void;
}

interface TipCard {
  icon: string;
  title: string;
  description: string;
  example: string;
}

// #13: tutorial content folded into the completion step — no separate screen.
const TIPS: TipCard[] = [
  {
    icon: '📞',
    title: 'Call Someone',
    description: 'Ask Karuna to call anyone in your contacts',
    example: 'Call my daughter',
  },
  {
    icon: '⏰',
    title: 'Set a Reminder',
    description: 'Never forget medications or appointments',
    example: 'Remind me to take medicine at 8pm',
  },
  {
    icon: '💬',
    title: 'Ask Anything',
    description: 'Get help with everyday questions',
    example: "What's the weather today?",
  },
];

const REMINDER_TIMES = ['08:00 AM', '12:00 PM', '06:00 PM', '09:00 PM'];

export function OnboardingCompleteScreen({
  onComplete,
  readAloudEnabled,
}: OnboardingCompleteScreenProps): JSX.Element {
  const { addEmergencyContact } = useSettings();
  const [summary, setSummary] = useState<string[]>([]);
  const [triedTips, setTriedTips] = useState<Set<number>>(new Set());

  // #13: optional basics (previously QuickSetupScreen) — everything optional.
  const [reminderTime, setReminderTime] = useState('08:00 AM');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');

  useEffect(() => {
    buildSummary().catch(() => {});
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (readAloudEnabled) {
      ttsService.speak(
        "You're all set! Here are some things you can say. Tap Start Talking when you're ready."
      ).catch(() => {
        // Error already surfaced via onSpeakError.
      });
    }
  }, [readAloudEnabled]);

  const buildSummary = async () => {
    const items: string[] = [];
    const role = onboardingStore.getRole();
    items.push(role === 'caregiver' ? 'Caregiver mode' : 'Personal mode');

    const security = await onboardingStore.getSecurityMethod();
    if (security === 'biometric') items.push('Face or fingerprint unlock enabled');
    else if (security === 'pin') items.push('PIN lock enabled');

    setSummary(items);
  };

  const handleTryTip = useCallback(
    (index: number) => {
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }
      ttsService.speak(TIPS[index].example).catch(() => {
        // Error already surfaced via onSpeakError.
      });
      setTriedTips((prev) => {
        const next = new Set(prev);
        next.add(index);
        return next;
      });
    },
    []
  );

  const handleStart = useCallback(async () => {
    if (Platform.OS !== 'web') {
      try {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } catch {
        /* intentionally empty */
      }
    }

    // Save optional basics (all optional — empty values are simply skipped).
    const data: QuickSetupData = {};
    if (reminderTime) data.reminderTime = reminderTime;
    if (contactName.trim()) data.trustedContactName = contactName.trim();
    if (contactPhone.trim()) data.trustedContactPhone = contactPhone.trim();
    await onboardingStore.setQuickSetupData(data);
    if (contactName.trim() && contactPhone.trim()) {
      addEmergencyContact({
        name: contactName.trim(),
        phoneNumber: contactPhone.trim(),
        relationship: 'Trusted Contact',
      });
    }

    onComplete();
  }, [reminderTime, contactName, contactPhone, addEmergencyContact, onComplete]);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={onboardingStyles.content}
      showsVerticalScrollIndicator={false}
    >
      <IconCircle icon="✅" color={colors.success} />

      <Text style={onboardingStyles.title}>You're All Set!</Text>
      <Text style={onboardingStyles.subtitle}>Karuna is ready to help you</Text>

      {/* #13: tutorial tips folded in */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Things you can say</Text>
        <Text style={styles.sectionHint}>Tap an example to hear it</Text>
        {TIPS.map((tip, i) => (
          <TouchableOpacity
            key={i}
            style={styles.tipCard}
            onPress={() => handleTryTip(i)}
            accessible
            accessibilityRole="button"
            accessibilityLabel={`Try saying: ${tip.example}`}
            accessibilityHint="Plays the example phrase aloud"
          >
            <Text style={styles.tipIcon}>{tip.icon}</Text>
            <View style={styles.tipText}>
              <Text style={styles.tipTitle}>{tip.title}</Text>
              <Text style={styles.tipExample}>"{tip.example}"</Text>
            </View>
            <Text style={styles.tipPlay}>
              {triedTips.has(i) ? '🔊 Again' : '🔊 Hear it'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* #13: optional basics folded in */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>A few basics (optional)</Text>
        <Text style={styles.sectionHint}>
          When should Karuna check in each day?
        </Text>
        <View style={styles.timeRow}>
          {REMINDER_TIMES.map((time) => (
            <TouchableOpacity
              key={time}
              style={[styles.timeChip, reminderTime === time && styles.timeChipActive]}
              onPress={() => setReminderTime(time)}
              accessible
              accessibilityRole="button"
              accessibilityLabel={time}
              accessibilityState={{ selected: reminderTime === time }}
            >
              <Text
                style={[
                  styles.timeChipText,
                  reminderTime === time && styles.timeChipTextActive,
                ]}
              >
                {time}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.fieldLabel}>Someone Karuna can help you reach</Text>
        <TextInput
          style={styles.input}
          placeholder="Name (optional)"
          placeholderTextColor={colors.textSecondary}
          value={contactName}
          onChangeText={setContactName}
          accessible
          accessibilityLabel="Trusted contact name"
        />
        <TextInput
          style={styles.input}
          placeholder="Phone number (optional)"
          placeholderTextColor={colors.textSecondary}
          value={contactPhone}
          onChangeText={setContactPhone}
          keyboardType="phone-pad"
          accessible
          accessibilityLabel="Trusted contact phone number"
        />
      </View>

      {summary.length > 0 && (
        <View style={styles.summaryBox}>
          {summary.map((item, i) => (
            <Text key={i} style={styles.summaryItem}>
              ✓ {item}
            </Text>
          ))}
        </View>
      )}

      <View style={onboardingStyles.bottomArea}>
        <OnboardingButton
          title="Start Talking"
          onPress={handleStart}
          accessibilityHint="Completes setup and opens Karuna"
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  section: {
    width: '100%',
    marginTop: SPACING.lg,
  },
  sectionTitle: {
    fontSize: fonts.bodyLarge,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  sectionHint: {
    fontSize: fonts.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: SPACING.xs,
    marginBottom: SPACING.md,
  },
  tipCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    minHeight: TOUCH_TARGETS.comfortable,
    gap: SPACING.sm,
  },
  tipIcon: {
    fontSize: 32,
  },
  tipText: {
    flex: 1,
  },
  tipTitle: {
    fontSize: fonts.body,
    fontWeight: '700',
    color: colors.text,
  },
  tipExample: {
    fontSize: fonts.body,
    color: colors.textSecondary,
    fontStyle: 'italic',
    marginTop: 2,
  },
  tipPlay: {
    fontSize: fonts.body - 2,
    color: colors.primary,
    fontWeight: '600',
  },
  timeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  timeChip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: 'transparent',
    minHeight: TOUCH_TARGETS.minimum,
    justifyContent: 'center',
  },
  timeChipActive: {
    borderColor: colors.primary,
  },
  timeChipText: {
    fontSize: fonts.body,
    color: colors.text,
    fontWeight: '500',
  },
  timeChipTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  fieldLabel: {
    fontSize: fonts.body,
    fontWeight: '600',
    color: colors.text,
    marginBottom: SPACING.sm,
    marginTop: SPACING.sm,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    fontSize: fonts.body,
    color: colors.text,
    marginBottom: SPACING.sm,
    minHeight: TOUCH_TARGETS.comfortable,
  },
  summaryBox: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: SPACING.lg,
    marginTop: SPACING.xl,
    width: '100%',
    gap: SPACING.sm,
  },
  summaryItem: {
    fontSize: fonts.body,
    color: colors.text,
    lineHeight: fonts.body * 1.5,
  },
});
