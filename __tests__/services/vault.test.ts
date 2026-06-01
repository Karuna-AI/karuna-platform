/**
 * @jest-environment node
 *
 * Vault Service Tests — comprehensive real-service tests.
 * Node env required so crypto.subtle is available for AES-256-GCM encryption.
 * encryptionService is NOT mocked — tests verify real encrypt/decrypt round-trips.
 * AsyncStorage is mocked with an in-memory store.
 */

// ── In-memory AsyncStorage (must be declared before imports) ──────────────────
const _store: Record<string, string | null> = {};

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn((key: string) => Promise.resolve(_store[key] ?? null)),
    setItem: jest.fn((key: string, value: string) => {
      _store[key] = value;
      return Promise.resolve();
    }),
    removeItem: jest.fn((key: string) => {
      delete _store[key];
      return Promise.resolve();
    }),
    clear: jest.fn(() => {
      Object.keys(_store).forEach(k => delete _store[k]);
      return Promise.resolve();
    }),
    multiRemove: jest.fn((keys: string[]) => {
      keys.forEach(k => delete _store[k]);
      return Promise.resolve();
    }),
  },
}));

jest.mock('../../src/services/auditLog', () => ({
  auditLogService: {
    log: jest.fn().mockResolvedValue(undefined),
    logVaultAccess: jest.fn().mockResolvedValue(undefined),
    initialize: jest.fn().mockResolvedValue(undefined),
  },
}));

import { vaultService } from '../../src/services/vault';
import { encryptionService } from '../../src/services/encryption';

// ── Helpers ───────────────────────────────────────────────────────────────────
const PIN = '1234';

function clearStore() {
  Object.keys(_store).forEach(k => delete _store[k]);
}

/** Full reset: clear store → create new vault → lock → unlock (forces loadData from storage,
 *  avoiding EMPTY_VAULT shallow-copy mutation that accumulates data across tests). */
async function resetAndUnlock(pin = PIN): Promise<void> {
  clearStore();
  await encryptionService.resetVault();
  await vaultService.createVault(pin);
  // Lock then re-unlock so loadData() re-parses from AsyncStorage giving fresh arrays
  vaultService.lock();
  await vaultService.unlock(pin);
}

// ── Type-safe fixture helpers ─────────────────────────────────────────────────
const accountFixture = () => ({
  type: 'bank' as const,
  name: 'HDFC Savings',
  institution: 'HDFC Bank',
  accountNumber: '1234567890',
  ifscCode: 'HDFC0001234',
});

const contactFixture = () => ({
  name: 'Dr. Ramesh',
  relationship: 'doctor' as const,
  phoneNumbers: [{ label: 'mobile', number: '9876543210', isPrimary: true }],
  email: 'dr.ramesh@clinic.com',
});

const medFixture = () => ({
  name: 'Metformin',
  dosage: '500mg',
  frequency: 'twice_daily' as const,
  isActive: true,
  reason: 'Diabetes',
  prescribedBy: 'Dr. Ramesh',
  startDate: '2026-01-01',
});

const doctorFixture = () => ({
  name: 'Dr. Anita Kapoor',
  specialty: 'cardiologist' as const,
  clinic: 'Heart Care',
  phoneNumbers: ['98765'],
  consultationHours: 'Mon-Fri 10-5',
  consultationFee: '500',
});

const futureDate = () => new Date(Date.now() + 86400000).toISOString().split('T')[0];

const apptFixture = () => ({
  title: 'Cardiology Follow-up',
  type: 'doctor' as const,
  date: futureDate(),
  time: '10:00',
  location: 'Heart Care Clinic',
  withPerson: 'Dr. Kapoor',
  reminderEnabled: false,
  status: 'scheduled' as const,
});

const docFixture = () => ({
  name: 'Aadhaar Card',
  category: 'id_proof' as const,
});

const routineFixture = () => ({
  name: 'Morning Walk',
  type: 'morning' as const,
  time: '07:00',
  reminderEnabled: false,
  isActive: true,
});

const noteFixture = () => ({
  content: 'Take BP reading daily',
  category: 'health',
  visibleToUser: true,
  addedBy: 'caregiver' as const,
  tags: [] as string[],
});

// ═════════════════════════════════════════════════════════════════════════════
// 1. Lifecycle — create, unlock, lock, delete
// ═════════════════════════════════════════════════════════════════════════════
describe('VaultService – lifecycle', () => {
  beforeEach(clearStore);

  it('hasVault() returns false before createVault()', async () => {
    await encryptionService.resetVault();
    expect(await vaultService.hasVault()).toBe(false);
  });

  it('createVault() returns true and unlocks the vault', async () => {
    await encryptionService.resetVault();
    const result = await vaultService.createVault(PIN);
    expect(result).toBe(true);
    expect(vaultService.isUnlocked()).toBe(true);
  });

  it('hasVault() returns true after createVault()', async () => {
    await encryptionService.resetVault();
    await vaultService.createVault(PIN);
    expect(await vaultService.hasVault()).toBe(true);
  });

  it('lock() makes isUnlocked() return false', async () => {
    await resetAndUnlock();
    vaultService.lock();
    expect(vaultService.isUnlocked()).toBe(false);
  });

  it('unlock() with correct PIN re-opens vault', async () => {
    await resetAndUnlock();
    vaultService.lock();
    const ok = await vaultService.unlock(PIN);
    expect(ok).toBe(true);
    expect(vaultService.isUnlocked()).toBe(true);
  });

  it('unlock() with wrong PIN returns false', async () => {
    await resetAndUnlock();
    vaultService.lock();
    const ok = await vaultService.unlock('9999');
    expect(ok).toBe(false);
    expect(vaultService.isUnlocked()).toBe(false);
  });

  it('deleteVault() removes data and locks vault', async () => {
    await resetAndUnlock();
    await vaultService.deleteVault();
    expect(vaultService.isUnlocked()).toBe(false);
    expect(await vaultService.hasVault()).toBe(false);
  });

  it('data persists across lock/unlock cycles', async () => {
    await resetAndUnlock();
    await vaultService.addAccount(accountFixture());
    vaultService.lock();
    await vaultService.unlock(PIN);
    const accounts = await vaultService.getAccounts();
    expect(accounts).toHaveLength(1);
    expect(accounts[0].name).toBe('HDFC Savings');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. Guard — operations on locked vault throw
// ═════════════════════════════════════════════════════════════════════════════
describe('VaultService – locked guard', () => {
  beforeEach(async () => {
    await resetAndUnlock();
    vaultService.lock();
  });

  it('getAccounts() throws when locked', async () => {
    await expect(vaultService.getAccounts()).rejects.toThrow('Vault is locked');
  });

  it('addContact() throws when locked', async () => {
    await expect(vaultService.addContact(contactFixture())).rejects.toThrow('Vault is locked');
  });

  it('getMedications() throws when locked', async () => {
    await expect(vaultService.getMedications()).rejects.toThrow('Vault is locked');
  });

  it('exportVault() throws when locked', async () => {
    await expect(vaultService.exportVault()).rejects.toThrow('Vault is locked');
  });

  it('getDoctors() throws when locked', async () => {
    await expect(vaultService.getDoctors()).rejects.toThrow('Vault is locked');
  });

  it('getAppointments() throws when locked', async () => {
    await expect(vaultService.getAppointments()).rejects.toThrow('Vault is locked');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. Accounts CRUD
// ═════════════════════════════════════════════════════════════════════════════
describe('VaultService – accounts CRUD', () => {
  beforeEach(resetAndUnlock);

  it('starts with empty accounts', async () => {
    expect(await vaultService.getAccounts()).toHaveLength(0);
  });

  it('addAccount() returns the new account with id', async () => {
    const acc = await vaultService.addAccount(accountFixture());
    expect(acc.id).toBeDefined();
    expect(acc.name).toBe('HDFC Savings');
    expect(acc.type).toBe('bank');
  });

  it('addAccount() sets createdAt and updatedAt', async () => {
    const before = Date.now();
    const acc = await vaultService.addAccount(accountFixture());
    expect(acc.createdAt).toBeGreaterThanOrEqual(before);
    expect(acc.updatedAt).toBeGreaterThanOrEqual(before);
  });

  it('getAccounts() returns all added accounts', async () => {
    await vaultService.addAccount(accountFixture());
    await vaultService.addAccount({ ...accountFixture(), name: 'SBI Savings' });
    expect(await vaultService.getAccounts()).toHaveLength(2);
  });

  it('getAccount() returns account by id', async () => {
    const acc = await vaultService.addAccount(accountFixture());
    const found = await vaultService.getAccount(acc.id);
    expect(found?.name).toBe('HDFC Savings');
  });

  it('getAccount() returns null for unknown id', async () => {
    expect(await vaultService.getAccount('nonexistent')).toBeNull();
  });

  it('updateAccount() modifies the account', async () => {
    const acc = await vaultService.addAccount(accountFixture());
    const updated = await vaultService.updateAccount(acc.id, { institution: 'New Bank' });
    expect(updated?.institution).toBe('New Bank');
  });

  it('updateAccount() updates updatedAt timestamp', async () => {
    const acc = await vaultService.addAccount(accountFixture());
    const before = Date.now();
    const updated = await vaultService.updateAccount(acc.id, { institution: 'X' });
    expect(updated?.updatedAt).toBeGreaterThanOrEqual(before);
  });

  it('updateAccount() returns null for unknown id', async () => {
    expect(await vaultService.updateAccount('nope', { institution: 'X' })).toBeNull();
  });

  it('deleteAccount() removes the account', async () => {
    const acc = await vaultService.addAccount(accountFixture());
    expect(await vaultService.deleteAccount(acc.id)).toBe(true);
    expect(await vaultService.getAccounts()).toHaveLength(0);
  });

  it('deleteAccount() returns false for unknown id', async () => {
    expect(await vaultService.deleteAccount('ghost')).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3b. List getters return fresh copies (M4 — vault list didn't refresh after delete)
//     deleteX() splices the internal array in place; if getX() returns that same
//     reference, the screen's setState(getX()) is Object.is-equal → React bails out
//     of the re-render and the deleted item lingers on screen. Getters must return
//     a new array each call so the list re-renders.
// ═════════════════════════════════════════════════════════════════════════════
describe('VaultService – list getters return fresh copies (M4 fix)', () => {
  beforeEach(resetAndUnlock);

  it('getAccounts() returns a new array reference on each call', async () => {
    const a = await vaultService.getAccounts();
    const b = await vaultService.getAccounts();
    expect(a).not.toBe(b);
  });

  it('mutating the returned array does not corrupt internal vault state', async () => {
    await vaultService.addAccount(accountFixture());
    const list = await vaultService.getAccounts();
    list.length = 0; // external mutation
    expect(await vaultService.getAccounts()).toHaveLength(1);
  });

  it('after deleteAccount(), getAccounts() returns a different reference than before', async () => {
    const acc = await vaultService.addAccount(accountFixture());
    const before = await vaultService.getAccounts();
    await vaultService.deleteAccount(acc.id);
    const after = await vaultService.getAccounts();
    expect(after).not.toBe(before);
    expect(after).toHaveLength(0);
  });

  it('getContacts() and getDoctors() also return fresh references', async () => {
    expect(await vaultService.getContacts()).not.toBe(await vaultService.getContacts());
    expect(await vaultService.getDoctors()).not.toBe(await vaultService.getDoctors());
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. Contacts CRUD
// ═════════════════════════════════════════════════════════════════════════════
describe('VaultService – contacts CRUD', () => {
  beforeEach(resetAndUnlock);

  it('starts with empty contacts', async () => {
    expect(await vaultService.getContacts()).toHaveLength(0);
  });

  it('addContact() returns stored contact with id', async () => {
    const c = await vaultService.addContact(contactFixture());
    expect(c.id).toBeDefined();
    expect(c.name).toBe('Dr. Ramesh');
  });

  it('getContacts() returns all contacts', async () => {
    await vaultService.addContact(contactFixture());
    await vaultService.addContact({ ...contactFixture(), name: 'Nurse Priya', relationship: 'caregiver' as const });
    expect(await vaultService.getContacts()).toHaveLength(2);
  });

  it('getContact() by id returns correct one', async () => {
    const c = await vaultService.addContact(contactFixture());
    expect((await vaultService.getContact(c.id))?.name).toBe('Dr. Ramesh');
  });

  it('getContact() returns null for unknown id', async () => {
    expect(await vaultService.getContact('unknown')).toBeNull();
  });

  it('updateContact() patches specified field', async () => {
    const c = await vaultService.addContact(contactFixture());
    const updated = await vaultService.updateContact(c.id, { email: 'new@clinic.com' });
    expect(updated?.email).toBe('new@clinic.com');
    expect(updated?.name).toBe('Dr. Ramesh');
  });

  it('updateContact() returns null for unknown id', async () => {
    expect(await vaultService.updateContact('nope', { email: 'x' })).toBeNull();
  });

  it('deleteContact() removes the contact', async () => {
    const c = await vaultService.addContact(contactFixture());
    expect(await vaultService.deleteContact(c.id)).toBe(true);
    expect(await vaultService.getContacts()).toHaveLength(0);
  });

  it('deleteContact() returns false for unknown id', async () => {
    expect(await vaultService.deleteContact('gone')).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. Medications CRUD
// ═════════════════════════════════════════════════════════════════════════════
describe('VaultService – medications CRUD', () => {
  beforeEach(resetAndUnlock);

  it('getMedications(true) returns only active meds', async () => {
    await vaultService.addMedication(medFixture());
    await vaultService.addMedication({ ...medFixture(), name: 'Aspirin', isActive: false });
    const active = await vaultService.getMedications(true);
    expect(active).toHaveLength(1);
    expect(active[0].name).toBe('Metformin');
  });

  it('getMedications(false) returns all meds', async () => {
    await vaultService.addMedication(medFixture());
    await vaultService.addMedication({ ...medFixture(), name: 'Aspirin', isActive: false });
    expect(await vaultService.getMedications(false)).toHaveLength(2);
  });

  it('getMedication() returns by id', async () => {
    const m = await vaultService.addMedication(medFixture());
    expect((await vaultService.getMedication(m.id))?.name).toBe('Metformin');
  });

  it('getMedication() returns null for unknown id', async () => {
    expect(await vaultService.getMedication('nope')).toBeNull();
  });

  it('updateMedication() patches dosage', async () => {
    const m = await vaultService.addMedication(medFixture());
    const updated = await vaultService.updateMedication(m.id, { dosage: '1000mg' });
    expect(updated?.dosage).toBe('1000mg');
    expect(updated?.name).toBe('Metformin');
  });

  it('updateMedication() returns null for unknown id', async () => {
    expect(await vaultService.updateMedication('x', { dosage: '1mg' })).toBeNull();
  });

  it('deleteMedication() removes medication', async () => {
    const m = await vaultService.addMedication(medFixture());
    expect(await vaultService.deleteMedication(m.id)).toBe(true);
    expect(await vaultService.getMedications()).toHaveLength(0);
  });

  it('deleteMedication() returns false for unknown id', async () => {
    expect(await vaultService.deleteMedication('gone')).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. Doctors CRUD
// ═════════════════════════════════════════════════════════════════════════════
describe('VaultService – doctors CRUD', () => {
  beforeEach(resetAndUnlock);

  it('starts with empty doctors', async () => {
    expect(await vaultService.getDoctors()).toHaveLength(0);
  });

  it('addDoctor() returns stored doctor with id', async () => {
    const d = await vaultService.addDoctor(doctorFixture());
    expect(d.id).toBeDefined();
    expect(d.specialty).toBe('cardiologist');
  });

  it('getDoctors() returns all doctors', async () => {
    await vaultService.addDoctor(doctorFixture());
    await vaultService.addDoctor({ ...doctorFixture(), name: 'Dr. Singh', specialty: 'neurologist' as const });
    expect(await vaultService.getDoctors()).toHaveLength(2);
  });

  it('getDoctor() by id', async () => {
    const d = await vaultService.addDoctor(doctorFixture());
    expect((await vaultService.getDoctor(d.id))?.name).toBe('Dr. Anita Kapoor');
  });

  it('getDoctor() returns null for unknown id', async () => {
    expect(await vaultService.getDoctor('x')).toBeNull();
  });

  it('updateDoctor() patches consultationFee', async () => {
    const d = await vaultService.addDoctor(doctorFixture());
    const updated = await vaultService.updateDoctor(d.id, { consultationFee: '750' });
    expect(updated?.consultationFee).toBe('750');
  });

  it('updateDoctor() returns null for unknown id', async () => {
    expect(await vaultService.updateDoctor('nope', { consultationFee: '0' })).toBeNull();
  });

  it('deleteDoctor() removes entry', async () => {
    const d = await vaultService.addDoctor(doctorFixture());
    expect(await vaultService.deleteDoctor(d.id)).toBe(true);
    expect(await vaultService.getDoctors()).toHaveLength(0);
  });

  it('deleteDoctor() returns false for unknown id', async () => {
    expect(await vaultService.deleteDoctor('ghost')).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 7. Appointments CRUD
// ═════════════════════════════════════════════════════════════════════════════
describe('VaultService – appointments CRUD', () => {
  beforeEach(resetAndUnlock);

  it('starts with empty appointments', async () => {
    expect(await vaultService.getAppointments()).toHaveLength(0);
  });

  it('addAppointment() returns appointment with id', async () => {
    const a = await vaultService.addAppointment(apptFixture());
    expect(a.id).toBeDefined();
    expect(a.title).toBe('Cardiology Follow-up');
  });

  it('getAppointments(true) returns only upcoming scheduled ones', async () => {
    await vaultService.addAppointment(apptFixture());
    await vaultService.addAppointment({ ...apptFixture(), date: '2020-01-01', title: 'Old Visit' });
    const upcoming = await vaultService.getAppointments(true);
    expect(upcoming).toHaveLength(1);
    expect(upcoming[0].title).toBe('Cardiology Follow-up');
  });

  it('getAppointments(true) excludes non-scheduled status', async () => {
    await vaultService.addAppointment({ ...apptFixture(), status: 'cancelled' });
    expect(await vaultService.getAppointments(true)).toHaveLength(0);
  });

  it('getAppointment() by id', async () => {
    const a = await vaultService.addAppointment(apptFixture());
    expect((await vaultService.getAppointment(a.id))?.title).toBe('Cardiology Follow-up');
  });

  it('getAppointment() returns null for unknown id', async () => {
    expect(await vaultService.getAppointment('x')).toBeNull();
  });

  it('updateAppointment() patches status', async () => {
    const a = await vaultService.addAppointment(apptFixture());
    const updated = await vaultService.updateAppointment(a.id, { status: 'completed' });
    expect(updated?.status).toBe('completed');
  });

  it('updateAppointment() returns null for unknown id', async () => {
    expect(await vaultService.updateAppointment('nope', { status: 'cancelled' })).toBeNull();
  });

  it('deleteAppointment() removes entry', async () => {
    const a = await vaultService.addAppointment(apptFixture());
    expect(await vaultService.deleteAppointment(a.id)).toBe(true);
    expect(await vaultService.getAppointments()).toHaveLength(0);
  });

  it('deleteAppointment() returns false for unknown id', async () => {
    expect(await vaultService.deleteAppointment('ghost')).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 8. Documents CRUD
// ═════════════════════════════════════════════════════════════════════════════
describe('VaultService – documents CRUD', () => {
  beforeEach(resetAndUnlock);

  it('starts with empty documents', async () => {
    expect(await vaultService.getDocuments()).toHaveLength(0);
  });

  it('addDocument() returns document with id', async () => {
    const d = await vaultService.addDocument(docFixture());
    expect(d.id).toBeDefined();
    expect(d.name).toBe('Aadhaar Card');
  });

  it('getDocuments(category) filters by category', async () => {
    await vaultService.addDocument(docFixture());
    await vaultService.addDocument({ name: 'PAN Card', category: 'bank' as const });
    expect(await vaultService.getDocuments('id_proof')).toHaveLength(1);
    expect(await vaultService.getDocuments('bank')).toHaveLength(1);
  });

  it('getDocument() by id', async () => {
    const d = await vaultService.addDocument(docFixture());
    expect((await vaultService.getDocument(d.id))?.name).toBe('Aadhaar Card');
  });

  it('getDocument() returns null for unknown id', async () => {
    expect(await vaultService.getDocument('x')).toBeNull();
  });

  it('updateDocument() patches description', async () => {
    const d = await vaultService.addDocument(docFixture());
    const updated = await vaultService.updateDocument(d.id, { description: 'Primary ID proof' });
    expect(updated?.description).toBe('Primary ID proof');
  });

  it('updateDocument() returns null for unknown id', async () => {
    expect(await vaultService.updateDocument('nope', { description: 'X' })).toBeNull();
  });

  it('deleteDocument() removes entry', async () => {
    const d = await vaultService.addDocument(docFixture());
    expect(await vaultService.deleteDocument(d.id)).toBe(true);
    expect(await vaultService.getDocuments()).toHaveLength(0);
  });

  it('deleteDocument() returns false for unknown id', async () => {
    expect(await vaultService.deleteDocument('gone')).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 9. Routines & Notes
// ═════════════════════════════════════════════════════════════════════════════
describe('VaultService – routines and notes', () => {
  beforeEach(resetAndUnlock);

  it('addRoutine() and getRoutines() work', async () => {
    await vaultService.addRoutine(routineFixture());
    expect(await vaultService.getRoutines()).toHaveLength(1);
  });

  it('getRoutines(true) returns only active', async () => {
    await vaultService.addRoutine(routineFixture());
    await vaultService.addRoutine({ ...routineFixture(), name: 'Yoga', isActive: false });
    expect(await vaultService.getRoutines(true)).toHaveLength(1);
  });

  it('getRoutines(false) returns all', async () => {
    await vaultService.addRoutine(routineFixture());
    await vaultService.addRoutine({ ...routineFixture(), name: 'Yoga', isActive: false });
    expect(await vaultService.getRoutines(false)).toHaveLength(2);
  });

  it('addNote() and getNotes(true) return visible notes', async () => {
    await vaultService.addNote(noteFixture());
    expect(await vaultService.getNotes(true)).toHaveLength(1);
  });

  it('getNotes(false) returns all notes regardless of visibility', async () => {
    await vaultService.addNote({ ...noteFixture(), visibleToUser: false });
    expect(await vaultService.getNotes(false)).toHaveLength(1);
    expect(await vaultService.getNotes(true)).toHaveLength(0);
  });

  it('addNote() defaults createdBy to caregiver', async () => {
    const n = await vaultService.addNote(noteFixture());
    expect(n.createdBy).toBe('caregiver');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 10. Export / Import
// ═════════════════════════════════════════════════════════════════════════════
describe('VaultService – export and import', () => {
  beforeEach(resetAndUnlock);

  it('exportVault() returns JSON with version and accounts array', async () => {
    await vaultService.addAccount(accountFixture());
    const exported = await vaultService.exportVault();
    const parsed = JSON.parse(exported);
    expect(parsed.accounts).toHaveLength(1);
    expect(parsed.version).toBe(1);
    expect(parsed.lastUpdated).toBeDefined();
  });

  it('importVault() restores exported data', async () => {
    await vaultService.addAccount(accountFixture());
    const exported = await vaultService.exportVault();

    await resetAndUnlock();
    expect(await vaultService.importVault(exported)).toBe(true);
    const accounts = await vaultService.getAccounts();
    expect(accounts[0].name).toBe('HDFC Savings');
  });

  it('importVault() returns false for invalid JSON', async () => {
    expect(await vaultService.importVault('not valid json {{')).toBe(false);
  });

  it('importVault() returns false when accounts array is missing', async () => {
    expect(await vaultService.importVault(JSON.stringify({ version: 1, foo: 'bar' }))).toBe(false);
  });

  it('importVault() returns false when version field is missing', async () => {
    expect(await vaultService.importVault(JSON.stringify({ accounts: [] }))).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 11. AI Lookup helpers
// ═════════════════════════════════════════════════════════════════════════════
describe('VaultService – AI lookup helpers', () => {
  beforeEach(resetAndUnlock);

  it('listMedications() returns not-found when empty', async () => {
    const result = await vaultService.listMedications();
    expect(result.found).toBe(false);
  });

  it('listMedications() returns only active medications', async () => {
    await vaultService.addMedication(medFixture());
    await vaultService.addMedication({ ...medFixture(), name: 'Aspirin', isActive: false });
    const result = await vaultService.listMedications();
    expect(result.found).toBe(true);
    expect((result.data as any).medications).toHaveLength(1);
    expect((result.data as any).medications[0].name).toBe('Metformin');
  });

  it('getUpcomingAppointmentsForAI() returns not-found when empty', async () => {
    const result = await vaultService.getUpcomingAppointmentsForAI();
    expect(result.found).toBe(false);
  });

  it('getUpcomingAppointmentsForAI() returns upcoming scheduled appointments', async () => {
    await vaultService.addAppointment(apptFixture());
    const result = await vaultService.getUpcomingAppointmentsForAI();
    expect(result.found).toBe(true);
    expect((result.data as any).appointments).toHaveLength(1);
  });

  it('lookupDoctor() returns not-found for unknown name/specialty', async () => {
    expect((await vaultService.lookupDoctor('Unknown')).found).toBe(false);
  });

  it('lookupDoctor() finds by name', async () => {
    await vaultService.addDoctor(doctorFixture());
    const result = await vaultService.lookupDoctor('Anita');
    expect(result.found).toBe(true);
    expect((result.data as any).name).toBe('Dr. Anita Kapoor');
  });

  it('lookupDoctor() finds by specialty', async () => {
    await vaultService.addDoctor(doctorFixture());
    const result = await vaultService.lookupDoctor('cardiologist');
    expect(result.found).toBe(true);
  });

  it('lookupDocumentLocation() returns not-found for unknown doc', async () => {
    expect((await vaultService.lookupDocumentLocation('Passport')).found).toBe(false);
  });

  it('lookupDocumentLocation() finds document by name', async () => {
    await vaultService.addDocument({ name: 'Passport', category: 'id_proof' as const, physicalLocation: 'Locker' });
    const result = await vaultService.lookupDocumentLocation('Passport');
    expect(result.found).toBe(true);
    expect((result.data as any).physicalLocation).toBe('Locker');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 12. Quick Facts
// ═════════════════════════════════════════════════════════════════════════════
describe('VaultService – quick facts', () => {
  beforeEach(resetAndUnlock);

  it('getQuickFact() returns null for unknown key', async () => {
    expect(await vaultService.getQuickFact('blood_type')).toBeNull();
  });

  it('setQuickFact() stores a fact and getQuickFact() retrieves it', async () => {
    await vaultService.setQuickFact('blood_type', 'O+', 'health');
    expect(await vaultService.getQuickFact('blood_type')).toBe('O+');
  });

  it('setQuickFact() overwrites an existing fact with the same key', async () => {
    await vaultService.setQuickFact('blood_type', 'O+', 'health');
    await vaultService.setQuickFact('blood_type', 'A-', 'health');
    expect(await vaultService.getQuickFact('blood_type')).toBe('A-');
  });

  it('setQuickFact() persists across lock/unlock', async () => {
    await vaultService.setQuickFact('allergy', 'penicillin', 'health');
    vaultService.lock();
    await vaultService.unlock(PIN);
    expect(await vaultService.getQuickFact('allergy')).toBe('penicillin');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 13. Search
// ═════════════════════════════════════════════════════════════════════════════
describe('VaultService – search', () => {
  beforeEach(resetAndUnlock);

  it('search() returns empty array when nothing matches', async () => {
    const results = await vaultService.search('xyzzy');
    expect(results).toHaveLength(0);
  });

  it('search() finds matching account by name', async () => {
    await vaultService.addAccount(accountFixture());
    const results = await vaultService.search('HDFC');
    expect(results.some(r => r.type === 'account')).toBe(true);
  });

  it('search() finds matching account by institution', async () => {
    await vaultService.addAccount(accountFixture());
    const results = await vaultService.search('HDFC Bank');
    const acc = results.find(r => r.type === 'account');
    expect(acc).toBeDefined();
  });

  it('search() finds matching medication by name', async () => {
    await vaultService.addMedication(medFixture());
    const results = await vaultService.search('Metformin');
    expect(results.some(r => r.type === 'medication')).toBe(true);
  });

  it('search() finds matching doctor by name', async () => {
    await vaultService.addDoctor(doctorFixture());
    const results = await vaultService.search('Anita');
    expect(results.some(r => r.type === 'doctor')).toBe(true);
  });

  it('search() finds matching doctor by specialty', async () => {
    await vaultService.addDoctor(doctorFixture());
    const results = await vaultService.search('cardiologist');
    expect(results.some(r => r.type === 'doctor')).toBe(true);
  });

  it('search() finds matching document by name', async () => {
    await vaultService.addDocument({ name: 'PAN Card', category: 'id_proof' as const, physicalLocation: 'Drawer' });
    const results = await vaultService.search('PAN');
    expect(results.some(r => r.type === 'document')).toBe(true);
  });

  it('search() finds matching document by physicalLocation', async () => {
    await vaultService.addDocument({ name: 'Land Deed', category: 'property' as const, physicalLocation: 'Bank Locker' });
    const results = await vaultService.search('Bank Locker');
    expect(results.some(r => r.type === 'document')).toBe(true);
  });

  it('search() sorts results by relevanceScore descending', async () => {
    await vaultService.addAccount({ ...accountFixture(), institution: 'test match' });
    await vaultService.addAccount({ ...accountFixture(), name: 'test match' });
    const results = await vaultService.search('test');
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].relevanceScore).toBeGreaterThanOrEqual(results[i].relevanceScore);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 14. lookupAccount
// ═════════════════════════════════════════════════════════════════════════════
describe('VaultService – lookupAccount', () => {
  beforeEach(resetAndUnlock);

  it('returns not-found when vault has no accounts', async () => {
    const result = await vaultService.lookupAccount('bank');
    expect(result.found).toBe(false);
  });

  it('returns single account detail when one match', async () => {
    await vaultService.addAccount(accountFixture());
    const result = await vaultService.lookupAccount('bank');
    expect(result.found).toBe(true);
    expect((result.data as any).name).toBe('HDFC Savings');
  });

  it('returns multiple summary when more than one match', async () => {
    await vaultService.addAccount(accountFixture());
    await vaultService.addAccount({ ...accountFixture(), name: 'SBI Savings', type: 'bank' as const });
    const result = await vaultService.lookupAccount('bank');
    expect(result.found).toBe(true);
    expect((result.data as any).accounts).toHaveLength(2);
  });

  it('filters by name parameter', async () => {
    await vaultService.addAccount(accountFixture());
    await vaultService.addAccount({ ...accountFixture(), name: 'SBI Savings', institution: 'SBI' });
    const result = await vaultService.lookupAccount(undefined, 'SBI');
    expect(result.found).toBe(true);
    expect((result.data as any).name).toBe('SBI Savings');
  });

  it('returns not-found when type filter matches nothing', async () => {
    await vaultService.addAccount(accountFixture());
    const result = await vaultService.lookupAccount('insurance');
    expect(result.found).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 15. getVaultSummary
// ═════════════════════════════════════════════════════════════════════════════
describe('VaultService – getVaultSummary', () => {
  beforeEach(resetAndUnlock);

  it('returns zeros for empty vault', async () => {
    const summary = await vaultService.getVaultSummary();
    expect(summary.accounts).toBe(0);
    expect(summary.contacts).toBe(0);
    expect(summary.medications).toBe(0);
    expect(summary.doctors).toBe(0);
    expect(summary.documents).toBe(0);
    expect(summary.appointments).toBe(0);
  });

  it('counts active medications and scheduled appointments only', async () => {
    await vaultService.addAccount(accountFixture());
    await vaultService.addMedication(medFixture());
    await vaultService.addMedication({ ...medFixture(), name: 'Aspirin', isActive: false });
    await vaultService.addAppointment(apptFixture());
    await vaultService.addAppointment({ ...apptFixture(), status: 'cancelled' as const });
    const summary = await vaultService.getVaultSummary();
    expect(summary.accounts).toBe(1);
    expect(summary.medications).toBe(1);
    expect(summary.appointments).toBe(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 16. Appointment ordering
// ═════════════════════════════════════════════════════════════════════════════
describe('VaultService – appointment ordering', () => {
  beforeEach(resetAndUnlock);

  it('getAppointments(true) returns upcoming sorted by date asc', async () => {
    const day1 = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const day2 = new Date(Date.now() + 172800000).toISOString().split('T')[0];
    await vaultService.addAppointment({ ...apptFixture(), date: day2, title: 'Second' });
    await vaultService.addAppointment({ ...apptFixture(), date: day1, title: 'First' });
    const upcoming = await vaultService.getAppointments(true);
    expect(upcoming[0].title).toBe('First');
    expect(upcoming[1].title).toBe('Second');
  });
});
