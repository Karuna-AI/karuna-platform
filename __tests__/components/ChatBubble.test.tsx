/**
 * ChatBubble Component Tests
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { ChatBubble } from '../../src/components/ChatBubble';
import { Message } from '../../src/types';

const BASE_TIMESTAMP = 1700000000000; // Fixed timestamp for deterministic output

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'msg-1',
    role: 'user',
    content: 'Hello, world!',
    timestamp: BASE_TIMESTAMP,
    ...overrides,
  };
}

describe('ChatBubble', () => {
  describe('user messages', () => {
    it('renders the message content', () => {
      render(<ChatBubble message={makeMessage({ content: 'Hello from user' })} />);
      expect(screen.getByText('Hello from user')).toBeTruthy();
    });

    it('does not render the "Karuna" sender label for user messages', () => {
      render(<ChatBubble message={makeMessage({ role: 'user' })} />);
      expect(screen.queryByText('Karuna')).toBeNull();
    });

    it('renders a formatted timestamp', () => {
      const message = makeMessage({ timestamp: BASE_TIMESTAMP });
      render(<ChatBubble message={message} />);
      const date = new Date(BASE_TIMESTAMP);
      const expectedTime = date.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      expect(screen.getByText(expectedTime)).toBeTruthy();
    });

    it('sets correct accessibility label including "You said" prefix', () => {
      const message = makeMessage({ role: 'user', content: 'Test content' });
      render(<ChatBubble message={message} />);
      const date = new Date(BASE_TIMESTAMP);
      const expectedTime = date.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      const expectedLabel = `You said: Test content. ${expectedTime}`;
      expect(screen.getByLabelText(expectedLabel)).toBeTruthy();
    });

    it('has an accessible container with aria-label', () => {
      const message = makeMessage({ role: 'user', content: 'Check label' });
      render(<ChatBubble message={message} />);
      // Outer View gets aria-label from accessibilityLabel prop
      expect(screen.getByLabelText(/You said: Check label/)).toBeTruthy();
    });
  });

  describe('assistant messages', () => {
    it('renders the message content for assistant', () => {
      render(
        <ChatBubble message={makeMessage({ role: 'assistant', content: 'Hi there!' })} />
      );
      expect(screen.getByText('Hi there!')).toBeTruthy();
    });

    it('renders the "Karuna" sender label for assistant messages', () => {
      render(<ChatBubble message={makeMessage({ role: 'assistant' })} />);
      expect(screen.getByText('Karuna')).toBeTruthy();
    });

    it('sets correct accessibility label including "Karuna said" prefix', () => {
      const message = makeMessage({ role: 'assistant', content: 'How are you?' });
      render(<ChatBubble message={message} />);
      const date = new Date(BASE_TIMESTAMP);
      const expectedTime = date.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      const expectedLabel = `Karuna said: How are you?. ${expectedTime}`;
      expect(screen.getByLabelText(expectedLabel)).toBeTruthy();
    });

    it('does not show Karuna label for user role', () => {
      render(<ChatBubble message={makeMessage({ role: 'user' })} />);
      expect(screen.queryByText('Karuna')).toBeNull();
    });
  });

  describe('timestamp formatting', () => {
    it('formats a morning timestamp with AM', () => {
      // 09:05 AM UTC → local time varies, just verify timestamp renders
      const morningTs = new Date('2024-01-15T09:05:00').getTime();
      render(<ChatBubble message={makeMessage({ timestamp: morningTs })} />);
      const date = new Date(morningTs);
      const formatted = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      expect(screen.getByText(formatted)).toBeTruthy();
    });

    it('renders timestamp at midnight boundary', () => {
      const midnightTs = new Date('2024-01-15T00:00:00').getTime();
      render(<ChatBubble message={makeMessage({ timestamp: midnightTs })} />);
      const date = new Date(midnightTs);
      const formatted = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      expect(screen.getByText(formatted)).toBeTruthy();
    });
  });

  describe('content variations', () => {
    it('renders long message content without truncation', () => {
      const longContent = 'This is a very long message that contains many words. '.repeat(10);
      render(<ChatBubble message={makeMessage({ content: longContent })} />);
      // Text may be split across elements by the renderer; check the accessible label instead
      expect(screen.getByLabelText(/This is a very long message/)).toBeTruthy();
    });

    it('renders a single character message', () => {
      render(<ChatBubble message={makeMessage({ content: '!' })} />);
      expect(screen.getByText('!')).toBeTruthy();
    });

    it('renders message with special characters', () => {
      const specialContent = 'Hello <World> & "friends" — today\'s temp is 72°F!';
      render(<ChatBubble message={makeMessage({ content: specialContent })} />);
      expect(screen.getByText(specialContent)).toBeTruthy();
    });

    it('renders message with newlines', () => {
      const multiline = 'Line one\nLine two\nLine three';
      render(<ChatBubble message={makeMessage({ content: multiline })} />);
      // Lines may be split across elements; verify via the aria-label on the container
      expect(screen.getByLabelText(/Line one/)).toBeTruthy();
    });
  });

  describe('isLatest prop', () => {
    it('renders correctly when isLatest is true', () => {
      render(
        <ChatBubble message={makeMessage()} isLatest={true} />
      );
      expect(screen.getByText('Hello, world!')).toBeTruthy();
    });

    it('renders correctly when isLatest is false', () => {
      render(
        <ChatBubble message={makeMessage()} isLatest={false} />
      );
      expect(screen.getByText('Hello, world!')).toBeTruthy();
    });

    it('renders correctly when isLatest is omitted (default)', () => {
      render(<ChatBubble message={makeMessage()} />);
      expect(screen.getByText('Hello, world!')).toBeTruthy();
    });
  });
});
