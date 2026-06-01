/**
 * Covers buildDateContext() — the chat pipeline must always tell the model the
 * current date/time. Elderly and memory-impaired users (Karuna's audience)
 * frequently ask "what day is it today?"; without an injected date the LLM has
 * no knowledge of the current date and emits a literal "[insert current date here]"
 * placeholder (observed on-device, 2026-05-31). This guards the fix.
 */
import { buildDateContext } from '../../src/hooks/useChat';

describe('buildDateContext', () => {
  it('includes the weekday, day, month and year for a fixed date', () => {
    const ctx = buildDateContext(new Date('2026-05-31T09:30:00'));
    expect(ctx).toMatch(/Today is/i);
    expect(ctx).toContain('Sunday');
    expect(ctx).toContain('31');
    expect(ctx).toContain('May');
    expect(ctx).toContain('2026');
  });

  it('is wrapped in brackets like the other injected context blocks', () => {
    const ctx = buildDateContext(new Date('2026-01-01T00:00:00'));
    expect(ctx.trim().startsWith('[')).toBe(true);
    expect(ctx.trim().endsWith(']')).toBe(true);
  });

  it('does not emit a placeholder token', () => {
    const ctx = buildDateContext(new Date('2026-12-25T12:00:00'));
    expect(ctx.toLowerCase()).not.toContain('insert');
    expect(ctx).toContain('December');
    expect(ctx).toContain('Friday');
  });
});
