/**
 * Web mock for @react-native-community/slider
 * Uses native HTML range input
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';

interface SliderProps {
  value?: number;
  minimumValue?: number;
  maximumValue?: number;
  step?: number;
  onValueChange?: (value: number) => void;
  onSlidingStart?: (value: number) => void;
  onSlidingComplete?: (value: number) => void;
  minimumTrackTintColor?: string;
  maximumTrackTintColor?: string;
  thumbTintColor?: string;
  disabled?: boolean;
  style?: any;
  testID?: string;
}

function Slider({
  value = 0,
  minimumValue = 0,
  maximumValue = 1,
  step = 0,
  onValueChange,
  onSlidingStart,
  onSlidingComplete,
  minimumTrackTintColor = '#1976D2',
  maximumTrackTintColor = '#E0E0E0',
  thumbTintColor = '#1976D2',
  disabled = false,
  style,
  testID,
}: SliderProps): JSX.Element {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseFloat(e.target.value);
    onValueChange?.(newValue);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLInputElement>) => {
    onSlidingStart?.(parseFloat((e.target as HTMLInputElement).value));
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLInputElement>) => {
    onSlidingComplete?.(parseFloat((e.target as HTMLInputElement).value));
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLInputElement>) => {
    onSlidingStart?.(parseFloat((e.target as HTMLInputElement).value));
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLInputElement>) => {
    onSlidingComplete?.(parseFloat((e.target as HTMLInputElement).value));
  };

  // Calculate fill percentage for gradient
  const fillPercent = ((value - minimumValue) / (maximumValue - minimumValue)) * 100;

  return (
    <View style={[styles.container, style]}>
      <input
        type="range"
        min={minimumValue}
        max={maximumValue}
        step={step || 'any'}
        value={value}
        onChange={handleChange}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        disabled={disabled}
        data-testid={testID}
        style={{
          width: '100%',
          height: 40,
          cursor: disabled ? 'not-allowed' : 'pointer',
          accentColor: thumbTintColor,
          background: `linear-gradient(to right, ${minimumTrackTintColor} 0%, ${minimumTrackTintColor} ${fillPercent}%, ${maximumTrackTintColor} ${fillPercent}%, ${maximumTrackTintColor} 100%)`,
          borderRadius: 4,
          opacity: disabled ? 0.5 : 1,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    justifyContent: 'center',
  },
});

export default Slider;
