/**
 * Vault → care-circle sync mapping (H1).
 *
 * The mobile vault stores rich camelCase entities; the gateway's
 * POST /circles/:id/sync endpoint accepts a strict snake_case column whitelist
 * per entity type and REJECTS any unknown column (`invalid_fields` conflict).
 * These pure mappers translate a local vault entity into the exact
 * { entityType, data } payload the server accepts.
 *
 * Only the entity types a patient/owner can meaningfully sync without
 * server-side encryption are mapped here: doctor, medication, appointment,
 * contact. `account` and `document` are intentionally NOT mapped — the server
 * stores those in *_encrypted columns (plaintext would corrupt the caregiver
 * read path) and caregivers cannot edit them. They remain pull-only for now.
 */

export type VaultEntityKind =
  | 'account'
  | 'contact'
  | 'medication'
  | 'doctor'
  | 'appointment'
  | 'document';

/** Server entity types that the sync endpoint accepts (singular). */
export type SyncEntityType = 'medication' | 'doctor' | 'appointment' | 'contact';

/** Concrete vault entity for each syncable kind. */
export interface SyncEntityMap {
  doctor: VaultDoctor;
  medication: VaultMedication;
  appointment: VaultAppointment;
  contact: VaultContact;
}

const SUPPORTED: SyncEntityType[] = ['medication', 'doctor', 'appointment', 'contact'];

export function isSyncSupported(kind: VaultEntityKind): kind is SyncEntityType {
  return (SUPPORTED as string[]).includes(kind);
}

import type {
  VaultDoctor,
  VaultMedication,
  VaultAppointment,
  VaultContact,
  VaultEntity,
} from '../types/vault';

/** Drop undefined/null values so we never send empty columns the server would reject. */
function compact(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== '')
  );
}

function mapDoctor(e: VaultDoctor): Record<string, unknown> {
  const phones: string[] = Array.isArray(e.phoneNumbers) ? e.phoneNumbers : [];
  return compact({
    name: e.name,
    specialty: e.specialtyOther || e.specialty,
    hospital: e.clinic,
    phone: phones[0],
    email: e.email,
    address: e.clinicAddress,
    notes: e.notes,
  });
}

function mapMedication(e: VaultMedication): Record<string, unknown> {
  const timing = Array.isArray(e.times) && e.times.length ? e.times.join(', ') : e.customSchedule;
  return compact({
    name: e.name,
    dosage: e.dosage,
    frequency: e.frequency,
    timing,
    instructions: e.instructions,
    prescribing_doctor: e.prescribedBy,
    pharmacy: e.pharmacy,
    refill_date: e.refillDate,
    is_active: typeof e.isActive === 'boolean' ? e.isActive : undefined,
  });
}

function mapAppointment(e: VaultAppointment): Record<string, unknown> {
  return compact({
    doctor_name: e.withPerson,
    date: e.date,
    time: e.time,
    location: e.location || e.address,
    purpose: e.title,
    preparation_notes: e.preparationNotes,
    status: e.status,
  });
}

function mapContact(e: VaultContact): Record<string, unknown> {
  const nums: { number?: string }[] = Array.isArray(e.phoneNumbers) ? e.phoneNumbers : [];
  return compact({
    name: e.name,
    relationship: e.relationship,
    phone: nums[0]?.number,
    phone_alt: nums[1]?.number,
    email: e.email,
    address: e.address,
    notes: e.notes,
  });
}

const MAPPERS: { [K in SyncEntityType]: (e: SyncEntityMap[K]) => Record<string, unknown> } = {
  doctor: mapDoctor,
  medication: mapMedication,
  appointment: mapAppointment,
  contact: mapContact,
};

/**
 * Translate a local vault entity into the server sync payload.
 * Returns null for entity kinds that are not synced (account/document) or
 * when the mapping produced no usable columns.
 */
export function toSyncPayload(
  kind: VaultEntityKind,
  entity: VaultEntity
): { entityType: SyncEntityType; data: Record<string, unknown> } | null {
  if (!isSyncSupported(kind)) return null;
  // The vault change listener only ever emits the entity matching `kind`, so
  // this dispatch is type-safe by construction; the assertion bridges the
  // base VaultEntity the listener signature carries.
  const map = MAPPERS[kind] as (e: VaultEntity) => Record<string, unknown>;
  const data = map(entity);
  if (Object.keys(data).length === 0) return null;
  return { entityType: kind, data };
}
