/**
 * consentAudience (M1/M2) — Privacy & Consent must be editable only for the data
 * owner (decided by CARE-CIRCLE ROLE, not the onboarding self-description), and
 * read-only + reframed for caregivers. A circle member whose role isn't known yet
 * must default to read-only so a caregiver never sees the editable owner UI.
 */
import { consentAudience } from '../../src/utils/consentAudience';

describe('consentAudience', () => {
  it('is editable + self-framed when NOT in a circle (own data)', () => {
    const a = consentAudience({ inCircle: false, role: null });
    expect(a.canEdit).toBe(true);
    expect(a.notice).toBeUndefined();
    expect(a.subtitle).toMatch(/you share/i);
  });

  it('is editable for the circle owner', () => {
    expect(consentAudience({ inCircle: true, role: 'owner' }).canEdit).toBe(true);
  });

  it('is read-only + reframed for a caregiver member', () => {
    const a = consentAudience({ inCircle: true, role: 'caregiver' });
    expect(a.canEdit).toBe(false);
    expect(a.notice).toMatch(/only the person who set up this care circle/i);
    expect(a.subtitle).toMatch(/person you care for/i);
    expect(a.subtitle).not.toMatch(/you share/i);
  });

  it('is read-only for a viewer member', () => {
    expect(consentAudience({ inCircle: true, role: 'viewer' }).canEdit).toBe(false);
  });

  it('defaults to READ-ONLY when in a circle but role is not yet known (safe default)', () => {
    // This is the regression guard for the original bug: a caregiver must NOT get the
    // editable owner UI just because their role hasn't resolved.
    expect(consentAudience({ inCircle: true, role: null }).canEdit).toBe(false);
  });
});
