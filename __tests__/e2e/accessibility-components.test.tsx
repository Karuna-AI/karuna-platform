/**
 * Accessibility Tests — component aria-labels
 *
 * Renders real components and verifies that aria-label values match the
 * format screen readers need, and that ErrorBoundary surfaces accessible
 * fallback text when a child throws.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { ChatBubble } from '../../src/components/ChatBubble';
import { ErrorBoundary } from '../../src/components/ErrorBoundary';
import type { Message } from '../../src/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

const FIXED_TS = 1700000000000;

function makeMsg(overrides: Partial<Message> = {}): Message {
  return { id: 'a1', role: 'user', content: 'Test message', timestamp: FIXED_TS, ...overrides };
}

// ── ChatBubble aria-labels ─────────────────────────────────────────────────────

describe('Accessibility: ChatBubble aria-labels', () => {
  it('user message aria-label starts with "You said:"', () => {
    render(<ChatBubble message={makeMsg({ role: 'user', content: 'Call my son' })} />);
    expect(screen.getByLabelText(/^You said:/)).toBeTruthy();
  });

  it('user message aria-label contains the message text', () => {
    render(<ChatBubble message={makeMsg({ role: 'user', content: 'Call my son' })} />);
    expect(screen.getByLabelText(/Call my son/)).toBeTruthy();
  });

  it('assistant message aria-label starts with "Karuna said:"', () => {
    render(<ChatBubble message={makeMsg({ role: 'assistant', content: 'Sure, calling Arjun now.' })} />);
    expect(screen.getByLabelText(/^Karuna said:/)).toBeTruthy();
  });

  it('assistant message aria-label contains the assistant response text', () => {
    render(<ChatBubble message={makeMsg({ role: 'assistant', content: 'Your blood pressure is 120/80.' })} />);
    expect(screen.getByLabelText(/120\/80/)).toBeTruthy();
  });

  it('renders message text visibly on screen', () => {
    render(<ChatBubble message={makeMsg({ content: 'Take your medicine now' })} />);
    expect(screen.getByText('Take your medicine now')).toBeTruthy();
  });

  it('assistant messages display the "Karuna" sender label', () => {
    render(<ChatBubble message={makeMsg({ role: 'assistant' })} />);
    expect(screen.getByText('Karuna')).toBeTruthy();
  });

  it('user messages do NOT display the "Karuna" sender label', () => {
    render(<ChatBubble message={makeMsg({ role: 'user' })} />);
    expect(screen.queryByText('Karuna')).toBeNull();
  });

  it('aria-label includes a formatted timestamp', () => {
    render(<ChatBubble message={makeMsg({ timestamp: FIXED_TS })} />);
    const date = new Date(FIXED_TS);
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    expect(screen.getByLabelText(new RegExp(timeStr.replace(':', ':')))).toBeTruthy();
  });
});

// ── ErrorBoundary accessible fallback ─────────────────────────────────────────

describe('Accessibility: ErrorBoundary fallback', () => {
  let consoleError: jest.SpyInstance;
  beforeEach(() => { consoleError = jest.spyOn(console, 'error').mockImplementation(() => {}); });
  afterEach(() => { consoleError.mockRestore(); });

  function Bomb(): JSX.Element {
    throw new Error('Intentional test error');
  }

  it('renders a user-readable fallback message when a child throws', () => {
    render(
      <ErrorBoundary fallbackMessage="Something went wrong. Please restart Karuna.">
        <Bomb />
      </ErrorBoundary>
    );
    expect(screen.getByText('Something went wrong. Please restart Karuna.')).toBeTruthy();
  });

  it('fallback text is visible in the DOM (not aria-hidden)', () => {
    render(
      <ErrorBoundary fallbackMessage="Karuna encountered an error loading the chat.">
        <Bomb />
      </ErrorBoundary>
    );
    const el = screen.getByText('Karuna encountered an error loading the chat.');
    expect(el.textContent).toBeTruthy();
  });

  it('fallback customises per-screen message', () => {
    render(
      <ErrorBoundary fallbackMessage="Vault could not be loaded. Please try again.">
        <Bomb />
      </ErrorBoundary>
    );
    expect(screen.getByText('Vault could not be loaded. Please try again.')).toBeTruthy();
  });
});
