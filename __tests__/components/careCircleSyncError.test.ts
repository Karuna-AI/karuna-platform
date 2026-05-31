/**
 * Unit tests for syncFailureAlert(): maps a sync error string to the
 * title/message shown to the (often elderly) user. Auth/session failures must
 * give actionable guidance to reconnect, not a dead-end "Unable to sync".
 */
import { syncFailureAlert } from '../../src/components/CareCircleScreen';

describe('syncFailureAlert', () => {
  it.each([
    'Invalid or expired token',
    'No token provided',
    'Not connected to care circle',
    'Unauthorized',
  ])('treats "%s" as a reconnect-needed session error', (err) => {
    const out = syncFailureAlert(err);
    expect(out.title).toBe('Reconnect Needed');
    expect(out.message).toMatch(/invitation code/i);
  });

  it('passes through a genuine network error verbatim', () => {
    const out = syncFailureAlert('Network error');
    expect(out.title).toBe('Sync Failed');
    expect(out.message).toBe('Network error');
  });

  it('falls back to a generic message when no error string is present', () => {
    const out = syncFailureAlert(undefined);
    expect(out.title).toBe('Sync Failed');
    expect(out.message).toBe('Unable to sync');
  });
});
