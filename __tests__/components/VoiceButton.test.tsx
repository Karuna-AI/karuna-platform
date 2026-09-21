/**
 * VoiceButton Component Tests
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { VoiceButton } from '../../src/components/VoiceButton';

// announceForAccessibility calls AccessibilityInfo under the hood — mock it
jest.mock('react-native/Libraries/Utilities/Platform', () => ({
  OS: 'web',
  select: (obj: any) => obj.web ?? obj.default,
}));

const defaultProps = {
  isRecording: false,
  isProcessing: false,
  isDisabled: false,
  recordingDuration: 0,
  onPressIn: jest.fn(),
  onPressOut: jest.fn(),
  onCancel: jest.fn(),
};

function renderButton(overrides = {}) {
  return render(<VoiceButton {...defaultProps} {...overrides} />);
}

describe('VoiceButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('idle state', () => {
    it('renders "Tap to talk" state text in idle state by default', () => {
      renderButton();
      expect(screen.getByText('Tap to talk')).toBeTruthy();
    });

    it('renders "Hold to talk" when tapToTalk is false', () => {
      renderButton({ tapToTalk: false });
      expect(screen.getByText('Hold to talk')).toBeTruthy();
    });

    it('has correct accessibility label in idle state', () => {
      renderButton();
      expect(
        screen.getByLabelText('Tap to talk button. Tap once to start speaking.')
      ).toBeTruthy();
    });

    it('has hold-to-talk accessibility label when tapToTalk is false', () => {
      renderButton({ tapToTalk: false });
      expect(
        screen.getByLabelText('Hold to talk button. Press and hold to start speaking.')
      ).toBeTruthy();
    });

    it('does not show recording duration in idle state', () => {
      // Duration container shows "0:00" only while recording
      renderButton({ recordingDuration: 0 });
      expect(screen.queryByText('0:00')).toBeNull();
    });

    it('does not show Cancel button in idle state', () => {
      renderButton();
      expect(screen.queryByText('Cancel')).toBeNull();
    });

    it('does not show "Listening..." in idle state', () => {
      renderButton();
      expect(screen.queryByText('Listening...')).toBeNull();
    });
  });

  describe('recording state', () => {
    it('renders "Tap to stop" state text while recording by default', () => {
      renderButton({ isRecording: true });
      expect(screen.getByText('Tap to stop')).toBeTruthy();
    });

    it('renders "Listening..." while recording in hold-to-talk mode', () => {
      renderButton({ isRecording: true, tapToTalk: false });
      expect(screen.getByText('Listening...')).toBeTruthy();
    });

    it('has correct accessibility label while recording', () => {
      renderButton({ isRecording: true, recordingDuration: 5000 });
      // formatDurationForAccessibility(5000) → "5 seconds"
      expect(
        screen.getByLabelText('Recording: 5 seconds. Tap to stop.')
      ).toBeTruthy();
    });

    it('shows formatted recording duration', () => {
      renderButton({ isRecording: true, recordingDuration: 65000 }); // 1:05
      expect(screen.getByText('1:05')).toBeTruthy();
    });

    it('shows formatted duration of 0:00 when recordingDuration is 0', () => {
      renderButton({ isRecording: true, recordingDuration: 0 });
      expect(screen.getByText('0:00')).toBeTruthy();
    });

    it('shows Cancel button while recording', () => {
      renderButton({ isRecording: true });
      expect(screen.getByText('Cancel')).toBeTruthy();
    });

    it('calls onCancel when Cancel button is pressed', () => {
      const onCancel = jest.fn();
      renderButton({ isRecording: true, onCancel });
      fireEvent.click(screen.getByText('Cancel'));
      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('does not show Cancel button if onCancel prop is not provided', () => {
      renderButton({ isRecording: true, onCancel: undefined });
      expect(screen.queryByText('Cancel')).toBeNull();
    });
  });

  describe('processing state', () => {
    it('renders "Thinking..." state text while processing', () => {
      renderButton({ isProcessing: true });
      expect(screen.getByText('Thinking...')).toBeTruthy();
    });

    it('has correct accessibility label while processing', () => {
      renderButton({ isProcessing: true });
      expect(screen.getByLabelText('Thinking...')).toBeTruthy();
    });

    it('does not show Cancel button while processing', () => {
      renderButton({ isProcessing: true, isRecording: false });
      expect(screen.queryByText('Cancel')).toBeNull();
    });

    it('processing state takes priority over recording state', () => {
      // Both flags set → processing wins
      renderButton({ isProcessing: true, isRecording: true });
      expect(screen.getByText('Thinking...')).toBeTruthy();
      expect(screen.queryByText('Listening...')).toBeNull();
    });
  });

  describe('disabled state', () => {
    it('renders thinking message when disabled', () => {
      renderButton({ isDisabled: true });
      expect(screen.getByText('Karuna is thinking — please wait')).toBeTruthy();
    });

    it('button has disabled accessibility state when isDisabled is true', () => {
      renderButton({ isDisabled: true });
      // The View with accessibilityState has role="button"
      const button = screen.getByRole('button', {
        name: 'Karuna is thinking — please wait',
      });
      expect(button).toBeTruthy();
    });

    it('button has busy accessibility state when processing', () => {
      renderButton({ isProcessing: true });
      const button = screen.getByRole('button', {
        name: 'Thinking...',
      });
      expect(button).toBeTruthy();
    });

    it('renders "Thinking..." state text while processing', () => {
      renderButton({ isProcessing: true });
      expect(screen.getByText('Thinking...')).toBeTruthy();
    });
  });

  describe('duration formatting', () => {
    it('formats 0 ms as 0:00', () => {
      renderButton({ isRecording: true, recordingDuration: 0 });
      expect(screen.getByText('0:00')).toBeTruthy();
    });

    it('formats 59000 ms as 0:59', () => {
      renderButton({ isRecording: true, recordingDuration: 59000 });
      expect(screen.getByText('0:59')).toBeTruthy();
    });

    it('formats 60000 ms as 1:00', () => {
      renderButton({ isRecording: true, recordingDuration: 60000 });
      expect(screen.getByText('1:00')).toBeTruthy();
    });

    it('formats 125000 ms as 2:05', () => {
      renderButton({ isRecording: true, recordingDuration: 125000 });
      expect(screen.getByText('2:05')).toBeTruthy();
    });
  });
});
