/**
 * vaultSyncMap (H1) — maps local camelCase vault entities to the gateway's
 * strict snake_case sync whitelist. The server rejects unknown columns, so the
 * critical guarantees are: (1) only whitelisted columns are emitted,
 * (2) camelCase→snake_case + array→scalar conversions are correct,
 * (3) account/document are not synced.
 */
import { toSyncPayload, isSyncSupported } from '../../src/services/vaultSyncMap';

// Server-side allowed columns (mirror of careCircle.js allowedColumns) — the
// mapping must never emit a key outside these sets.
const ALLOWED = {
  medication: ['name', 'dosage', 'frequency', 'timing', 'instructions', 'prescribing_doctor', 'pharmacy', 'refill_date', 'is_active'],
  doctor: ['name', 'specialty', 'hospital', 'phone', 'email', 'address', 'notes', 'is_primary'],
  appointment: ['doctor_id', 'doctor_name', 'date', 'time', 'location', 'purpose', 'preparation_notes', 'status', 'reminder_sent'],
  contact: ['name', 'relationship', 'phone', 'phone_alt', 'email', 'address', 'is_emergency', 'priority', 'notes'],
};

describe('vaultSyncMap', () => {
  it('does not sync account or document entities', () => {
    expect(isSyncSupported('account' as any)).toBe(false);
    expect(isSyncSupported('document' as any)).toBe(false);
    expect(toSyncPayload('account' as any, { name: 'x' })).toBeNull();
    expect(toSyncPayload('document' as any, { name: 'x' })).toBeNull();
  });

  it('maps a doctor: clinic→hospital, phoneNumbers[0]→phone, clinicAddress→address', () => {
    const out = toSyncPayload('doctor', {
      name: 'Dr QA', specialty: 'cardiologist', clinic: 'QA Clinic',
      clinicAddress: 'MG Road', phoneNumbers: ['111', '222'], email: 'd@x.com', notes: 'n',
    });
    expect(out).toEqual({
      entityType: 'doctor',
      data: { name: 'Dr QA', specialty: 'cardiologist', hospital: 'QA Clinic', phone: '111', email: 'd@x.com', address: 'MG Road', notes: 'n' },
    });
    Object.keys(out!.data).forEach(k => expect(ALLOWED.doctor).toContain(k));
  });

  it('uses specialtyOther when specialty is "other"', () => {
    const out = toSyncPayload('doctor', { name: 'D', specialty: 'other', specialtyOther: 'Hepatology', clinic: 'C' });
    expect(out!.data.specialty).toBe('Hepatology');
  });

  it('maps a medication: prescribedBy→prescribing_doctor, times[]→timing, isActive→is_active', () => {
    const out = toSyncPayload('medication', {
      name: 'Aspirin', dosage: '1 tab', frequency: 'twice_daily', times: ['8 AM', '8 PM'],
      prescribedBy: 'Dr QA', pharmacy: 'QA Pharma', refillDate: '2026-07-01', isActive: true, instructions: 'after food',
    });
    expect(out!.entityType).toBe('medication');
    expect(out!.data).toMatchObject({
      name: 'Aspirin', dosage: '1 tab', frequency: 'twice_daily', timing: '8 AM, 8 PM',
      prescribing_doctor: 'Dr QA', pharmacy: 'QA Pharma', refill_date: '2026-07-01', is_active: true, instructions: 'after food',
    });
    Object.keys(out!.data).forEach(k => expect(ALLOWED.medication).toContain(k));
  });

  it('maps a contact: phoneNumbers[].number→phone/phone_alt', () => {
    const out = toSyncPayload('contact', {
      name: 'Son', relationship: 'son',
      phoneNumbers: [{ number: '111', label: 'mobile', isPrimary: true }, { number: '222', label: 'home', isPrimary: false }],
      email: 's@x.com', address: 'Home', notes: 'n',
    });
    expect(out!.data).toEqual({ name: 'Son', relationship: 'son', phone: '111', phone_alt: '222', email: 's@x.com', address: 'Home', notes: 'n' });
    Object.keys(out!.data).forEach(k => expect(ALLOWED.contact).toContain(k));
  });

  it('maps an appointment: title→purpose, preparationNotes→preparation_notes', () => {
    const out = toSyncPayload('appointment', {
      title: 'Cardiology follow-up', type: 'doctor', date: '2026-07-01', time: '10:00',
      location: 'QA Clinic', preparationNotes: 'Fasting', status: 'scheduled', withPerson: 'Dr QA',
    });
    expect(out!.data).toMatchObject({
      purpose: 'Cardiology follow-up', date: '2026-07-01', time: '10:00', location: 'QA Clinic',
      preparation_notes: 'Fasting', status: 'scheduled', doctor_name: 'Dr QA',
    });
    Object.keys(out!.data).forEach(k => expect(ALLOWED.appointment).toContain(k));
  });

  it('omits undefined/empty fields and returns null when nothing usable maps', () => {
    const out = toSyncPayload('doctor', { name: 'D', clinic: 'C', email: undefined, notes: '' });
    expect(out!.data).toEqual({ name: 'D', hospital: 'C' });
    expect(toSyncPayload('contact', {})).toBeNull();
  });
});
