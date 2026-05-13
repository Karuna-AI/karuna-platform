/**
 * ErrorBoundary Component Tests
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from '../../src/components/ErrorBoundary';

// Suppress ALL console.error output in this file.
// React 18 emits several console.error calls for errors caught by an ErrorBoundary
// (the raw error, "The above error occurred...", and component stack) — all expected.
let errorSpy: jest.SpyInstance;
beforeAll(() => {
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterAll(() => {
  errorSpy.mockRestore();
});

// Component that throws on first render when `shouldThrow` is true
function ThrowingChild({ shouldThrow = false, message = 'Test error' }: { shouldThrow?: boolean; message?: string }) {
  if (shouldThrow) {
    throw new Error(message);
  }
  return <div data-testid="child-content">Child rendered successfully</div>;
}

// Component whose throw can be toggled via props (useful for testing retry reset)
class ToggleThrow extends React.Component<{ shouldThrow: boolean }, object> {
  render() {
    if (this.props.shouldThrow) throw new Error('Toggled error');
    return <div data-testid="toggle-child">OK</div>;
  }
}

describe('ErrorBoundary', () => {
  describe('normal operation (no error)', () => {
    it('renders children when no error occurs', () => {
      render(
        <ErrorBoundary>
          <ThrowingChild shouldThrow={false} />
        </ErrorBoundary>
      );
      expect(screen.getByTestId('child-content')).toBeTruthy();
    });

    it('renders multiple children without error', () => {
      render(
        <ErrorBoundary>
          <div data-testid="child-a">A</div>
          <div data-testid="child-b">B</div>
        </ErrorBoundary>
      );
      expect(screen.getByTestId('child-a')).toBeTruthy();
      expect(screen.getByTestId('child-b')).toBeTruthy();
    });

    it('does not show fallback UI when children are healthy', () => {
      render(
        <ErrorBoundary>
          <ThrowingChild shouldThrow={false} />
        </ErrorBoundary>
      );
      expect(screen.queryByText('Something went wrong')).toBeNull();
      expect(screen.queryByText('Try Again')).toBeNull();
    });
  });

  describe('error caught state', () => {
    it('shows "Something went wrong" heading when child throws', () => {
      render(
        <ErrorBoundary>
          <ThrowingChild shouldThrow={true} />
        </ErrorBoundary>
      );
      expect(screen.getByText('Something went wrong')).toBeTruthy();
    });

    it('shows default fallback message when no fallbackMessage prop provided', () => {
      render(
        <ErrorBoundary>
          <ThrowingChild shouldThrow={true} />
        </ErrorBoundary>
      );
      expect(
        screen.getByText('The app encountered an error. Please try again.')
      ).toBeTruthy();
    });

    it('shows custom fallbackMessage when provided', () => {
      render(
        <ErrorBoundary fallbackMessage="Custom error description">
          <ThrowingChild shouldThrow={true} />
        </ErrorBoundary>
      );
      expect(screen.getByText('Custom error description')).toBeTruthy();
      expect(
        screen.queryByText('The app encountered an error. Please try again.')
      ).toBeNull();
    });

    it('displays the thrown error message in the fallback UI', () => {
      render(
        <ErrorBoundary>
          <ThrowingChild shouldThrow={true} message="Specific failure reason" />
        </ErrorBoundary>
      );
      expect(screen.getByText('Specific failure reason')).toBeTruthy();
    });

    it('shows "Try Again" button in the fallback UI', () => {
      render(
        <ErrorBoundary>
          <ThrowingChild shouldThrow={true} />
        </ErrorBoundary>
      );
      expect(screen.getByText('Try Again')).toBeTruthy();
    });

    it('does not render the children inside the fallback UI', () => {
      render(
        <ErrorBoundary>
          <ThrowingChild shouldThrow={true} />
        </ErrorBoundary>
      );
      expect(screen.queryByTestId('child-content')).toBeNull();
    });
  });

  describe('retry / reset behaviour', () => {
    it('calls onReset callback when "Try Again" is pressed', () => {
      const onReset = jest.fn();
      render(
        <ErrorBoundary onReset={onReset}>
          <ThrowingChild shouldThrow={true} />
        </ErrorBoundary>
      );
      fireEvent.click(screen.getByText('Try Again'));
      expect(onReset).toHaveBeenCalledTimes(1);
    });

    it('does not crash if onReset is not provided and "Try Again" is pressed', () => {
      render(
        <ErrorBoundary>
          <ThrowingChild shouldThrow={true} />
        </ErrorBoundary>
      );
      expect(() => fireEvent.click(screen.getByText('Try Again'))).not.toThrow();
    });

    it('clears error state and re-renders children after retry when child no longer throws', () => {
      // Use a wrapper to control shouldThrow via state
      function Wrapper() {
        const [shouldThrow, setShouldThrow] = React.useState(true);
        return (
          <ErrorBoundary onReset={() => setShouldThrow(false)}>
            <ToggleThrow shouldThrow={shouldThrow} />
          </ErrorBoundary>
        );
      }

      render(<Wrapper />);

      // Error UI is visible
      expect(screen.getByText('Something went wrong')).toBeTruthy();

      // Press retry — onReset flips shouldThrow to false
      fireEvent.click(screen.getByText('Try Again'));

      // Child renders successfully now
      expect(screen.getByTestId('toggle-child')).toBeTruthy();
      expect(screen.queryByText('Something went wrong')).toBeNull();
    });
  });

  describe('componentDidCatch logging', () => {
    it('calls console.error with error details when child throws', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      render(
        <ErrorBoundary>
          <ThrowingChild shouldThrow={true} message="Logged error" />
        </ErrorBoundary>
      );
      // ErrorBoundary logs via console.error in componentDidCatch
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});
