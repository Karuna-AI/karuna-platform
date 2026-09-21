import React, { useCallback, useRef, useEffect, useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import {
  TouchableOpacity,
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  PanResponder,
  GestureResponderEvent,
  PanResponderGestureState,
  Platform,
} from 'react-native';
import {
  getFontSizes,
  TOUCH_TARGETS,
  SPACING,
  getAccessibilityHint,
  formatDurationForAccessibility,
  announceForAccessibility} from '../utils/accessibility';
import { getCurrentTranslations } from '../i18n/translations';

export type VoiceButtonState = 'idle' | 'recording' | 'processing';

interface VoiceButtonProps {
  isRecording: boolean;
  isProcessing: boolean;
  isDisabled?: boolean;
  recordingDuration?: number;
  onPressIn: () => void;
  onPressOut: () => void;
  onCancel?: () => void;
  /** Tap once to start, tap again to stop. Defaults to true (elderly-friendly). */
  tapToTalk?: boolean;
}

const CANCEL_THRESHOLD = 80; // Pixels to drag before cancel

export function VoiceButton({
  isRecording,
  isProcessing,
  isDisabled = false,
  recordingDuration = 0,
  onPressIn,
  onPressOut,
  onCancel,
  tapToTalk = true,
}: VoiceButtonProps): React.JSX.Element {
  const { colors } = useTheme();
  const fonts = getFontSizes('large');
  const t = getCurrentTranslations();

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const recordingAnim = useRef(new Animated.Value(0)).current;
  const cancelOpacity = useRef(new Animated.Value(0)).current;

  const [dragDistance, setDragDistance] = useState(0);
  const [showCancelHint, setShowCancelHint] = useState(false);

  // Determine current state
  const getState = (): VoiceButtonState => {
    if (isProcessing) return 'processing';
    if (isRecording) return 'recording';
    return 'idle';
  };

  const state = getState();

  // Ref mirror of props for the PanResponder handlers, which are created once.
  const liveProps = useRef({ tapToTalk, isRecording, isDisabled, isProcessing, onPressIn, onPressOut, onCancel });
  liveProps.current = { tapToTalk, isRecording, isDisabled, isProcessing, onPressIn, onPressOut, onCancel };

  // Pan responder for press-and-hold or tap-to-talk, with drag-to-cancel kept
  // only as a silent fallback (the visible Cancel button is the primary path).
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,

      onPanResponderGrant: () => {
        const p = liveProps.current;
        if (p.isDisabled || p.isProcessing) {
          // #4: when the button cannot start, announce why instead of silence.
          announceForAccessibility(getCurrentTranslations().chat.thinkingPleaseWait);
          return;
        }
        if (p.tapToTalk && p.isRecording) {
          // Tap-to-talk: second tap stops and sends.
          p.onPressOut();
        } else {
          p.onPressIn();
        }
      },

      onPanResponderMove: (
        _event: GestureResponderEvent,
        gestureState: PanResponderGestureState
      ) => {
        const p = liveProps.current;
        if (p.isRecording && !p.tapToTalk) {
          const distance = Math.sqrt(
            Math.pow(gestureState.dx, 2) + Math.pow(gestureState.dy, 2)
          );
          setDragDistance(distance);

          if (distance > CANCEL_THRESHOLD / 2 && !showCancelHint) {
            setShowCancelHint(true);
            Animated.timing(cancelOpacity, {
              toValue: 1,
              duration: 150,
              useNativeDriver: true,
            }).start();
          } else if (distance <= CANCEL_THRESHOLD / 2 && showCancelHint) {
            setShowCancelHint(false);
            Animated.timing(cancelOpacity, {
              toValue: 0,
              duration: 150,
              useNativeDriver: true,
            }).start();
          }
        }
      },

      onPanResponderRelease: (
        _event: GestureResponderEvent,
        gestureState: PanResponderGestureState
      ) => {
        const p = liveProps.current;
        const distance = Math.sqrt(
          Math.pow(gestureState.dx, 2) + Math.pow(gestureState.dy, 2)
        );

        if (p.tapToTalk) {
          // Tap-to-talk: release does nothing — stop via the next tap or the
          // Cancel button. Drag-away stays as a silent fallback only.
          if (p.isRecording && distance > CANCEL_THRESHOLD) {
            p.onCancel?.();
          }
        } else if (distance > CANCEL_THRESHOLD && p.isRecording) {
          // Cancel recording
          p.onCancel?.();
          announceForAccessibility('Recording cancelled');
        } else if (p.isRecording) {
          // Normal release - send
          p.onPressOut();
        }

        setDragDistance(0);
        setShowCancelHint(false);
        cancelOpacity.setValue(0);
      },

      onPanResponderTerminate: () => {
        // Another component took over
        if (liveProps.current.isRecording) {
          liveProps.current.onCancel?.();
        }
        setDragDistance(0);
        setShowCancelHint(false);
        cancelOpacity.setValue(0);
      },
    })
  ).current;

  // Animations based on state
  useEffect(() => {
    if (state === 'recording') {
      // Pulsing animation while recording
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      ).start();

      Animated.timing(recordingAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();

      announceForAccessibility(tapToTalk ? t.chat.tapToStop : t.chat.listening);
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);

      Animated.timing(recordingAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();

      if (state === 'processing') {
        announceForAccessibility('Processing your message.');
      }
    }

    return () => {
      pulseAnim.stopAnimation();
    };
  }, [state, pulseAnim, recordingAnim]);

  const formatDuration = useCallback((ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  // State text display — never the tiny/low-contrast fallback sizes
  const getStateText = (): string => {
    if (isDisabled && state === 'idle') {
      return t.chat.thinkingPleaseWait;
    }
    switch (state) {
      case 'processing':
        return t.chat.thinking;
      case 'recording':
        return tapToTalk ? t.chat.tapToStop : t.chat.listening;
      default:
        return tapToTalk ? t.chat.tapToTalk : t.chat.holdToTalk;
    }
  };

  // Accessibility — drag-cancel is no longer part of spoken instructions
  const getAccessibilityLabel = (): string => {
    if ((isDisabled || isProcessing) && state === 'idle') {
      return t.chat.thinkingPleaseWait;
    }
    switch (state) {
      case 'processing':
        return t.chat.thinking;
      case 'recording':
        return tapToTalk
          ? `Recording: ${formatDurationForAccessibility(recordingDuration)}. ${t.chat.tapToStop}.`
          : `Recording: ${formatDurationForAccessibility(recordingDuration)}. ${t.chat.listening}`;
      default:
        return tapToTalk
          ? `${t.chat.tapToTalk} button. Tap once to start speaking.`
          : `${t.chat.holdToTalk} button. Press and hold to start speaking.`;
    }
  };

  // Button colors based on state
  const getButtonColor = (): string => {
    switch (state) {
      case 'recording':
        return colors.error; // Red while recording
      case 'processing':
        return colors.textSecondary; // Gray while processing
      default:
        return colors.primary; // Blue when idle
    }
  };

  // Icon based on state
  const renderIcon = () => {
    if (state === 'recording') {
      // Stop/square icon
      return <View style={styles.stopIcon} />;
    }

    if (state === 'processing') {
      // Loading dots
      return (
        <View style={styles.loadingDotsContainer}>
          {[0, 1, 2].map((i) => (
            <Animated.View
              key={i}
              style={[
                styles.loadingDot,
                {
                  opacity: recordingAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.3, 1],
                  }),
                },
              ]}
            />
          ))}
        </View>
      );
    }

    // Microphone icon
    return (
      <View style={styles.micIcon}>
        <View style={styles.micHead} />
        <View style={styles.micBody} />
        <View style={styles.micBase} />
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Recording duration */}
      {state === 'recording' && (
        <View style={styles.durationContainer}>
          <Animated.View
            style={[
              styles.recordingIndicator,
              {
                backgroundColor: colors.error,
                opacity: recordingAnim,
              },
            ]}
          />
          <Text
            style={[
              styles.durationText,
              { color: colors.text, fontSize: fonts.body },
            ]}
          >
            {formatDuration(recordingDuration)}
          </Text>
        </View>
      )}

      {/* Cancel hint when dragging */}
      {showCancelHint && (
        <Animated.View
          style={[
            styles.cancelHint,
            {
              opacity: cancelOpacity,
              backgroundColor: colors.surface,
            },
          ]}
        >
          <Text style={[styles.cancelText, { color: colors.error }]}>
            Release to cancel
          </Text>
        </Animated.View>
      )}

      {/* Main button */}
      <Animated.View
        style={[
          { transform: [{ scale: pulseAnim }] },
          dragDistance > CANCEL_THRESHOLD && { opacity: 0.5 },
        ]}
      >
        <View
          {...panResponder.panHandlers}
          style={[
            styles.button,
            {
              backgroundColor: getButtonColor(),
              opacity: isDisabled ? 0.5 : 1,
            },
          ]}
          accessible={true}
          accessibilityLabel={getAccessibilityLabel()}
          accessibilityHint={getAccessibilityHint('record')}
          accessibilityRole="button"
          accessibilityState={{
            disabled: isDisabled || isProcessing,
            busy: isProcessing,
          }}
        >
          <View style={styles.iconContainer}>{renderIcon()}</View>
        </View>
      </Animated.View>

      {/* State text */}
      <Text
        style={[
          styles.stateText,
          {
            color:
              state === 'recording' ? colors.error : colors.textSecondary,
            fontSize: fonts.bodyLarge,
          },
        ]}
        accessible={true}
        accessibilityRole="text"
      >
        {getStateText()}
      </Text>

      {/* Cancel button - shown while recording */}
      {state === 'recording' && onCancel && (
        <TouchableOpacity
          style={[styles.cancelButton, { backgroundColor: colors.surface }]}
          onPress={() => {
            onCancel();
            announceForAccessibility('Recording cancelled');
          }}
          accessible={true}
          accessibilityLabel="Cancel recording"
          accessibilityRole="button"
        >
          <Text style={[styles.cancelButtonText, { color: colors.error }]}>
            Cancel
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: SPACING.lg,
  },
  button: {
    width: TOUCH_TARGETS.voiceButton,
    height: TOUCH_TARGETS.voiceButton,
    borderRadius: TOUCH_TARGETS.voiceButton / 2,
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      web: { boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.25)' },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
      },
    }),
  },
  iconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  stopIcon: {
    width: 28,
    height: 28,
    backgroundColor: '#FFFFFF',
    borderRadius: 4,
  },
  micIcon: {
    alignItems: 'center',
  },
  micHead: {
    width: 24,
    height: 32,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
  },
  micBody: {
    width: 32,
    height: 16,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    borderTopWidth: 0,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    marginTop: -4,
  },
  micBase: {
    width: 4,
    height: 8,
    backgroundColor: '#FFFFFF',
  },
  loadingDotsContainer: {
    flexDirection: 'row',
    gap: 6,
  },
  loadingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FFFFFF',
  },
  durationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  recordingIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: SPACING.sm,
  },
  durationText: {
    fontWeight: '600',
  },
  stateText: {
    marginTop: SPACING.md,
    fontWeight: '600',
  },
  cancelHint: {
    position: 'absolute',
    top: -40,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: 20,
  },
  cancelText: {
    fontWeight: '600',
    fontSize: 16,
  },
  cancelButton: {
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: 20,
    minHeight: TOUCH_TARGETS.minimum,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontWeight: '600',
    fontSize: 16,
  },
});

export default VoiceButton;
