/**
 * (b) — manual vital entry. buildVitalReading() turns the modal inputs into a
 * VitalReading payload (or null on invalid input), which addVitalReading then
 * stores AND uploads to the care circle (Fix A). Makes health logging reachable
 * in the UI instead of only via platform step-sync.
 */
import { buildVitalReading } from '../../src/components/HealthDashboard';

describe('buildVitalReading', () => {
  it('builds a scalar reading', () => {
    expect(buildVitalReading('heart_rate' as any, '72')).toEqual({
      type: 'heart_rate', value: 72, unit: 'bpm', source: 'manual',
    });
  });

  it('builds blood pressure with diastolic in secondaryValue', () => {
    const r = buildVitalReading('blood_pressure' as any, '120', '80');
    expect(r).toMatchObject({ type: 'blood_pressure', value: 120, secondaryValue: 80, unit: 'mmHg', source: 'manual' });
  });

  it('returns null when blood pressure is missing diastolic', () => {
    expect(buildVitalReading('blood_pressure' as any, '120')).toBeNull();
  });

  it.each(['', '   ', 'abc', '0', '-5'])('rejects invalid value "%s"', (v) => {
    expect(buildVitalReading('heart_rate' as any, v)).toBeNull();
  });

  it('returns null for an unknown/unsupported type', () => {
    expect(buildVitalReading('sleep' as any, '8')).toBeNull();
  });
});
