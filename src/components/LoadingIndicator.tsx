import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { getColors, getFontSizes, SPACING } from '../utils/accessibility';

interface LoadingIndicatorProps {
  message?: string;
  size?: 'small' | 'medium' | 'large';
}

export function LoadingIndicator({
  message = 'Thinking...',
  size = 'medium',
}: LoadingIndicatorProps): JSX.Element {
  const colors = getColors(true);
  const fonts = getFontSizes('large');

  const dot1Anim = useRef(new Animated.Value(0)).current;
  const dot2Anim = useRef(new Animated.Value(0)).current;
  const dot3Anim = useRef(new Animated.Value(0)).current;

  const dotSize = size === 'small' ? 8 : size === 'medium' ? 12 : 16;

  useEffect(() => {
    const createDotAnimation = (anim: Animated.Value, delay: number) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, {
            toValue: 1,
            duration: 300,
            easing: Easing.ease,
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0,
            duration: 300,
            easing: Easing.ease,
            useNativeDriver: true,
          }),
        ])
      );
    };

    const animation1 = createDotAnimation(dot1Anim, 0);
    const animation2 = createDotAnimation(dot2Anim, 150);
    const animation3 = createDotAnimation(dot3Anim, 300);

    animation1.start();
    animation2.start();
    animation3.start();

    return () => {
      animation1.stop();
      animation2.stop();
      animation3.stop();
    };
  }, [dot1Anim, dot2Anim, dot3Anim]);

  const getDotStyle = (anim: Animated.Value) => ({
    width: dotSize,
    height: dotSize,
    borderRadius: dotSize / 2,
    backgroundColor: colors.primary,
    marginHorizontal: 4,
    transform: [
      {
        scale: anim.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 1.4],
        }),
      },
    ],
    opacity: anim.interpolate({
      inputRange: [0, 1],
      outputRange: [0.4, 1],
    }),
  });

  return (
    <View
      style={styles.container}
      accessible={true}
      accessibilityLabel={message}
      accessibilityRole="progressbar"
    >
      <View style={styles.dotsContainer}>
        <Animated.View style={getDotStyle(dot1Anim)} />
        <Animated.View style={getDotStyle(dot2Anim)} />
        <Animated.View style={getDotStyle(dot3Anim)} />
      </View>
      {message && (
        <Text
          style={[
            styles.message,
            {
              color: colors.textSecondary,
              fontSize: size === 'small' ? fonts.body - 2 : fonts.body,
            },
          ]}
        >
          {message}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: SPACING.md,
  },
  dotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  message: {
    marginTop: SPACING.sm,
    fontWeight: '500',
  },
});

export default LoadingIndicator;
