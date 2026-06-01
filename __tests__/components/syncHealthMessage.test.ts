/**
 * syncHealthResultMessage (M3) — the "Sync Health Data" button must always give
 * the user a result, including the previously-silent "nothing to pull" case.
 */
import { syncHealthResultMessage } from '../../src/components/HealthDashboard';

describe('syncHealthResultMessage', () => {
  it('reports how many readings were synced (plural)', () => {
    expect(syncHealthResultMessage({ success: true, synced: 3 })).toEqual({
      title: 'Health data synced',
      body: 'Added 3 new readings.',
    });
  });

  it('uses singular for exactly one reading', () => {
    expect(syncHealthResultMessage({ success: true, synced: 1 }).body).toBe('Added 1 new reading.');
  });

  it('gives explicit feedback when there was nothing to sync (was a silent no-op)', () => {
    const msg = syncHealthResultMessage({ success: true, synced: 0 });
    expect(msg.title).toBe('You’re up to date');
    expect(msg.body).toMatch(/no new health data/i);
  });

  it('surfaces the error on failure', () => {
    expect(syncHealthResultMessage({ success: false, synced: 0, error: 'Network error' })).toEqual({
      title: 'Sync didn’t finish',
      body: 'Network error',
    });
  });

  it('falls back to a generic message when failure has no error string', () => {
    expect(syncHealthResultMessage({ success: false, synced: 0 }).body).toMatch(/try again/i);
  });
});
