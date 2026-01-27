import React, { useCallback, useRef, useEffect, useState } from 'react';
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
} from 'react-native';
import {
  getColors,
  getFontSizes,
  TOUCH_TARGETS,
  SPACING,
  createAccessibilityLabel,
  getAccessibilityHint,
  formatDurationForAccessibility,
  announceForAccessibility,
} from '../utils/accessibility';

export type VoiceButtonState = 'idle' | 'recording' | 'processing';

interface VoiceButtonProps {
  isRecording: boolean;
  isProcessing: boolean;
  isDisabled?: boolean;
  recordingDuration?: number;
  onPressIn: () => void;
  onPressOut: () => void;
  onCancel?: () => void;
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
}: VoiceButtonProps): JSX.Element {
  const colors = getColors(true);
  const fonts = getFontSizes('large');

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

  // Pan responder for drag-to-cancel
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,

      onPanResponderGrant: () => {
        if (!isDisabled && !isProcessing) {
          onPressIn();
        }
      },

      onPanResponderMove: (
        _event: GestureResponderEvent,
        gestureState: PanResponderGestureState
      ) => {
        if (isRecording) {
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
        const distance = Math.sqrt(
          Math.pow(gestureState.dx, 2) + Math.pow(gestureState.dy, 2)
        );

        if (distance > CANCEL_THRESHOLD && isRecording) {
          // Cancel recording
          onCancel?.();
          announceForAccessibility('Recording cancelled');
        } else if (isRecording) {
          // Normal release - send
          onPressOut();
        }

        setDragDistance(0);
        setShowCancelHint(false);
        cancelOpacity.setValue(0);
      },

      onPanResponderTerminate: () => {
        // Another component took over
        if (isRecording) {
          onCancel?.();
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

      announceForAccessibility('Recording. Speak now.');
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

  // State text display
  const getStateText = (): string => {
    switch (state) {
      case 'processing':
        return 'Thinking...';
      case 'recording':
        return 'Listening...';
      default:
        return 'Hold to talk';
    }
  };

  // Accessibility
  const getAccessibilityLabel = (): string => {
    switch (state) {
      case 'processing':
        return 'Processing your message. Please wait.';
      case 'recording':
        return `Recording: ${formatDurationForAccessibility(recordingDuration)}. Release to send, or drag away to cancel.`;
      default:
        return 'Hold to talk button. Press and hold to start speaking.';
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
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
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
    fontSize: 14,
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
