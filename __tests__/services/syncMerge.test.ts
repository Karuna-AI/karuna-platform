/**
 * Fix C1 — reverse-merge last-write-wins now reads the server's snake_case
 * `updated_at` (it previously only read camelCase `updatedAt`, so server rows'
 * timestamp was always undefined and caregiver edits never overwrote the device).
 */
import { CareCircleSyncService } from '../../src/services/careCircleSync';

describe('CareCircleSyncService.mergeDecision', () => {
  it('UPDATEs when a snake_case remote row is newer than the camelCase local item (the bug)', () => {
    expect(
      CareCircleSyncService.mergeDecision(
        { id: 'm1', updated_at: '2026-05-31T10:00:00Z' },
        { id: 'm1', updatedAt: '2026-05-30T10:00:00Z' },
      ),
    ).toBe('update');
  });

  it('ADDs when there is no local item', () => {
    expect(CareCircleSyncService.mergeDecision({ id: 'x', updated_at: '2026-05-31T10:00:00Z' }, undefined)).toBe('add');
  });

  it('SKIPs when remote is older than local', () => {
    expect(
      CareCircleSyncService.mergeDecision(
        { id: 'm1', updated_at: '2026-05-29T10:00:00Z' },
        { id: 'm1', updatedAt: '2026-05-30T10:00:00Z' },
      ),
    ).toBe('skip');
  });

  it('SKIPs when the remote row has no timestamp (do not clobber local)', () => {
    expect(
      CareCircleSyncService.mergeDecision({ id: 'm1' }, { id: 'm1', updatedAt: '2026-05-30T10:00:00Z' }),
    ).toBe('skip');
  });

  it('UPDATEs when local has no timestamp but remote does', () => {
    expect(
      CareCircleSyncService.mergeDecision({ id: 'm1', updated_at: '2026-05-30T10:00:00Z' }, { id: 'm1' }),
    ).toBe('update');
  });
});
