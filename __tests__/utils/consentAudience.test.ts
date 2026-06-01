/**
 * consentAudience (M1/M2) — the Privacy & Consent screen must be read-only and
 * correctly framed for caregivers (non-owners), since the server's PUT /consent
 * is owner-only.
 */
import { consentAudience } from '../../src/utils/consentAudience';

describe('consentAudience', () => {
  it('lets the patient (self) edit and frames it as their own data', () => {
    const a = consentAudience('self');
    expect(a.canEdit).toBe(true);
    expect(a.notice).toBeUndefined();
    expect(a.subtitle).toMatch(/you share/i);
  });

  it('makes consent read-only for a caregiver with an explanatory notice', () => {
    const a = consentAudience('caregiver');
    expect(a.canEdit).toBe(false);
    expect(a.notice).toMatch(/only the person who set up this care circle/i);
  });

  it('uses care-recipient framing (not "your data") for a caregiver', () => {
    const a = consentAudience('caregiver');
    expect(a.subtitle).toMatch(/person you care for/i);
    expect(a.subtitle).not.toMatch(/you share/i);
  });
});
