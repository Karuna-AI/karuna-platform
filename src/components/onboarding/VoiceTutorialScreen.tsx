import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Dimensions,
  Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
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

interface TutorialCard {
  icon: string;
  title: string;
  description: string;
  example: string;
}

const TUTORIAL_CARDS: TutorialCard[] = [
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

export function VoiceTutorialScreen({
  onNext,
  readAloudEnabled,
}: OnboardingScreenProps): JSX.Element {
  const scrollRef = useRef<ScrollView>(null);
  const [cardIndex, setCardIndex] = useState(0);
  const [triedCards, setTriedCards] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (readAloudEnabled) {
      ttsService.speak('Here are some things you can say. Try tapping the examples to hear them.');
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

  const handleTryIt = useCallback((index: number) => {
    if (Platform.OS !== 'web') { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); }
    ttsService.speak(TUTORIAL_CARDS[index].example);
    setTriedCards((prev) => {
      const next = new Set(prev);
      next.add(index);
      return next;
    });
  }, []);

  const handleContinue = useCallback(() => {
    telemetryService.track('onboarding_tutorial_viewed');
    onNext();
  }, [onNext]);

  return (
    <View style={onboardingStyles.content}>
      <Text style={onboardingStyles.title}>Things You Can Say</Text>
      <Text style={onboardingStyles.subtitle}>
        Try these examples — just tap to hear them
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
        {TUTORIAL_CARDS.map((card, i) => (
          <View key={i} style={{ width: CARD_WIDTH }}>
            <View style={styles.card}>
              <Text style={styles.cardIcon}>{card.icon}</Text>
              <Text style={styles.cardTitle}>{card.title}</Text>
              <Text style={styles.cardDescription}>{card.description}</Text>

              <TouchableOpacity
                style={[
                  styles.tryButton,
                  triedCards.has(i) && styles.tryButtonDone,
                ]}
                onPress={() => handleTryIt(i)}
                accessible
                accessibilityRole="button"
                accessibilityLabel={`Try saying: ${card.example}`}
                accessibilityHint="Plays the example phrase aloud"
              >
                <Text style={styles.tryButtonQuote}>"{card.example}"</Text>
                <Text style={styles.tryButtonLabel}>
                  {triedCards.has(i) ? '🔊 Tap to hear again' : '🔊 Tap to hear'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Page dots */}
      <View style={styles.pageDots}>
        {TUTORIAL_CARDS.map((_, i) => (
          <TouchableOpacity
            key={i}
            onPress={() => goToCard(i)}
            accessible
            accessibilityLabel={`Go to example ${i + 1}`}
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
          onPress={handleContinue}
          accessibilityHint="Continues to finish setup"
        />
      </View>
    </View>
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardIcon: {
    fontSize: 48,
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
  tryButton: {
    backgroundColor: colors.primary + '12',
    borderRadius: 16,
    padding: SPACING.lg,
    width: '100%',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.primary + '30',
    minHeight: TOUCH_TARGETS.comfortable,
    justifyContent: 'center',
  },
  tryButtonDone: {
    borderColor: colors.success + '50',
    backgroundColor: colors.success + '10',
  },
  tryButtonQuote: {
    fontSize: fonts.body,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
    fontStyle: 'italic',
    marginBottom: SPACING.sm,
  },
  tryButtonLabel: {
    fontSize: fonts.body - 2,
    color: colors.primary,
    fontWeight: '500',
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
