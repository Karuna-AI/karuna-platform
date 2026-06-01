import type { OnboardingRole } from '../services/onboardingStore';

/**
 * Role-aware presentation for the Privacy & Consent screen.
 *
 * M1: consent controls are owner-only (server PUT /consent rejects non-owners),
 * so a caregiver should see them read-only rather than toggles that silently
 * fail. M2: the framing ("what you share") assumes the device user is the
 * patient; a caregiver needs framing that says these belong to the person they
 * care for.
 */
export interface ConsentAudience {
  /** Whether this device's user may change consent (only the patient/owner). */
  canEdit: boolean;
  /** Sub-header copy under the screen title. */
  subtitle: string;
  /** Banner shown to non-owners explaining why controls are read-only. */
  notice?: string;
}

export function consentAudience(role: OnboardingRole): ConsentAudience {
  if (role === 'caregiver') {
    return {
      canEdit: false,
      subtitle: 'These sharing choices belong to the person you care for.',
      notice:
        'Only the person who set up this care circle can change what’s shared. ' +
        'These settings are managed on their device — you’re viewing them here.',
    };
  }
  // 'self' — the patient/owner controls their own sharing.
  return {
    canEdit: true,
    subtitle: 'Choose what you share with your caregivers.',
  };
}
