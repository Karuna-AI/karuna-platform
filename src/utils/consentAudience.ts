/**
 * Role-aware presentation for the Privacy & Consent screen.
 *
 * M1/M2: consent controls are owner-only (server `PUT /consent` rejects non-owners),
 * so a caregiver should see them read-only + reframed rather than an editable owner UI.
 *
 * The authority for "may edit consent" is **care-circle ownership**, NOT the local
 * onboarding self-description (the original fix's bug — a caregiver onboarded as
 * 'self' got the owner UI). We decide from the device's role in its circle:
 *   - not in a circle  → it's the user's own data → editable.
 *   - circle owner      → editable.
 *   - circle member (caregiver/viewer) or role-not-yet-known → read-only (safe default,
 *     so a caregiver never sees an editable owner UI before the role resolves).
 */
export type CircleRole = 'owner' | 'caregiver' | 'viewer';

export interface ConsentAudienceInput {
  /** Whether the device is connected to a care circle. */
  inCircle: boolean;
  /** The device user's role in that circle, or null if not yet known. */
  role: CircleRole | null;
}

export interface ConsentAudience {
  /** Whether this device's user may change consent (only the patient/owner). */
  canEdit: boolean;
  /** Sub-header copy under the screen title. */
  subtitle: string;
  /** Banner shown to non-owners explaining why controls are read-only. */
  notice?: string;
}

export function consentAudience(input: ConsentAudienceInput): ConsentAudience {
  // Owner of their own data when standalone (no circle) or explicitly the circle owner.
  const canEdit = !input.inCircle || input.role === 'owner';

  if (!canEdit) {
    return {
      canEdit: false,
      subtitle: 'These sharing choices belong to the person you care for.',
      notice:
        'Only the person who set up this care circle can change what’s shared. ' +
        'These settings are managed on their device — you’re viewing them here.',
    };
  }
  return {
    canEdit: true,
    subtitle: 'Choose what you share with your caregivers.',
  };
}
