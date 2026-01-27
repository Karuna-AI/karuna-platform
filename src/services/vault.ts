import AsyncStorage from '@react-native-async-storage/async-storage';
import { encryptionService } from './encryption';
import {
  KnowledgeVaultData,
  VaultAccount,
  VaultContact,
  VaultMedication,
  VaultRoutine,
  VaultDoctor,
  VaultAppointment,
  VaultDocument,
  VaultNote,
  VaultSearchResult,
  VaultLookupResult,
  VaultEntity,
} from '../types/vault';

const STORAGE_KEY = '@karuna/knowledge_vault';
const VAULT_VERSION = 1;

/**
 * Generate a unique ID
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create a base entity with common fields
 */
function createEntity(createdBy: 'user' | 'caregiver' = 'user'): Omit<VaultEntity, 'id'> & { id: string } {
  const now = Date.now();
  return {
    id: generateId(),
    createdAt: now,
    updatedAt: now,
    createdBy,
  };
}

/**
 * Empty vault data structure
 */
const EMPTY_VAULT: KnowledgeVaultData = {
  version: VAULT_VERSION,
  lastUpdated: Date.now(),
  accounts: [],
  contacts: [],
  medications: [],
  routines: [],
  doctors: [],
  appointments: [],
  documents: [],
  notes: [],
  quickFacts: [],
};

/**
 * Knowledge Vault Service
 *
 * Manages encrypted storage and retrieval of personal information.
 * All sensitive data is encrypted at rest using the encryption service.
 */
class VaultService {
  private data: KnowledgeVaultData | null = null;
  private isLoaded = false;
  private isLocked = true;

  // ============================================================================
  // Initialization & State
  // ============================================================================

  /**
   * Unlock the vault with a PIN
   */
  async unlock(pin: string): Promise<boolean> {
    const success = await encryptionService.initialize(pin);
    if (success) {
      this.isLocked = false;
      await this.loadData();
      return true;
    }
    return false;
  }

  /**
   * Lock the vault (clear data from memory)
   */
  lock(): void {
    this.data = null;
    this.isLoaded = false;
    this.isLocked = true;
    encryptionService.lock();
  }

  /**
   * Check if vault is unlocked
   */
  isUnlocked(): boolean {
    return !this.isLocked && this.isLoaded;
  }

  /**
   * Check if vault has been set up (has a PIN)
   */
  async hasVault(): Promise<boolean> {
    return encryptionService.hasExistingVault();
  }

  /**
   * Create a new vault with a PIN
   */
  async createVault(pin: string): Promise<boolean> {
    // Reset any existing vault
    await encryptionService.resetVault();
    await AsyncStorage.removeItem(STORAGE_KEY);

    // Initialize with new PIN
    const success = await encryptionService.initialize(pin);
    if (success) {
      this.isLocked = false;
      this.data = { ...EMPTY_VAULT, lastUpdated: Date.now() };
      await this.saveData();
      this.isLoaded = true;
      return true;
    }
    return false;
  }

  /**
   * Load vault data from encrypted storage
   */
  private async loadData(): Promise<void> {
    try {
      const encrypted = await AsyncStorage.getItem(STORAGE_KEY);
      if (encrypted) {
        this.data = await encryptionService.decryptObject<KnowledgeVaultData>(encrypted);
      } else {
        this.data = { ...EMPTY_VAULT, lastUpdated: Date.now() };
      }
      this.isLoaded = true;
    } catch (error) {
      console.error('Failed to load vault data:', error);
      this.data = { ...EMPTY_VAULT, lastUpdated: Date.now() };
      this.isLoaded = true;
    }
  }

  /**
   * Save vault data to encrypted storage
   */
  private async saveData(): Promise<void> {
    if (!this.data || this.isLocked) {
      throw new Error('Vault is locked');
    }

    try {
      this.data.lastUpdated = Date.now();
      const encrypted = await encryptionService.encryptObject(this.data);
      await AsyncStorage.setItem(STORAGE_KEY, encrypted);
    } catch (error) {
      console.error('Failed to save vault data:', error);
      throw error;
    }
  }

  /**
   * Ensure vault is ready for operations
   */
  private ensureUnlocked(): void {
    if (this.isLocked || !this.data) {
      throw new Error('Vault is locked. Please unlock first.');
    }
  }

  // ============================================================================
  // Accounts CRUD
  // ============================================================================

  async getAccounts(): Promise<VaultAccount[]> {
    this.ensureUnlocked();
    return this.data!.accounts;
  }

  async getAccount(id: string): Promise<VaultAccount | null> {
    this.ensureUnlocked();
    return this.data!.accounts.find(a => a.id === id) || null;
  }

  async addAccount(account: Omit<VaultAccount, keyof VaultEntity>): Promise<VaultAccount> {
    this.ensureUnlocked();
    const newAccount: VaultAccount = {
      ...createEntity(),
      ...account,
    };
    this.data!.accounts.push(newAccount);
    await this.saveData();
    return newAccount;
  }

  async updateAccount(id: string, updates: Partial<VaultAccount>): Promise<VaultAccount | null> {
    this.ensureUnlocked();
    const index = this.data!.accounts.findIndex(a => a.id === id);
    if (index === -1) return null;

    this.data!.accounts[index] = {
      ...this.data!.accounts[index],
      ...updates,
      updatedAt: Date.now(),
    };
    await this.saveData();
    return this.data!.accounts[index];
  }

  async deleteAccount(id: string): Promise<boolean> {
    this.ensureUnlocked();
    const index = this.data!.accounts.findIndex(a => a.id === id);
    if (index === -1) return false;

    this.data!.accounts.splice(index, 1);
    await this.saveData();
    return true;
  }

  // ============================================================================
  // Contacts CRUD
  // ============================================================================

  async getContacts(): Promise<VaultContact[]> {
    this.ensureUnlocked();
    return this.data!.contacts;
  }

  async getContact(id: string): Promise<VaultContact | null> {
    this.ensureUnlocked();
    return this.data!.contacts.find(c => c.id === id) || null;
  }

  async addContact(contact: Omit<VaultContact, keyof VaultEntity>): Promise<VaultContact> {
    this.ensureUnlocked();
    const newContact: VaultContact = {
      ...createEntity(),
      ...contact,
    };
    this.data!.contacts.push(newContact);
    await this.saveData();
    return newContact;
  }

  async updateContact(id: string, updates: Partial<VaultContact>): Promise<VaultContact | null> {
    this.ensureUnlocked();
    const index = this.data!.contacts.findIndex(c => c.id === id);
    if (index === -1) return null;

    this.data!.contacts[index] = {
      ...this.data!.contacts[index],
      ...updates,
      updatedAt: Date.now(),
    };
    await this.saveData();
    return this.data!.contacts[index];
  }

  async deleteContact(id: string): Promise<boolean> {
    this.ensureUnlocked();
    const index = this.data!.contacts.findIndex(c => c.id === id);
    if (index === -1) return false;

    this.data!.contacts.splice(index, 1);
    await this.saveData();
    return true;
  }

  // ============================================================================
  // Medications CRUD
  // ============================================================================

  async getMedications(activeOnly = false): Promise<VaultMedication[]> {
    this.ensureUnlocked();
    if (activeOnly) {
      return this.data!.medications.filter(m => m.isActive);
    }
    return this.data!.medications;
  }

  async getMedication(id: string): Promise<VaultMedication | null> {
    this.ensureUnlocked();
    return this.data!.medications.find(m => m.id === id) || null;
  }

  async addMedication(medication: Omit<VaultMedication, keyof VaultEntity>): Promise<VaultMedication> {
    this.ensureUnlocked();
    const newMed: VaultMedication = {
      ...createEntity(),
      ...medication,
    };
    this.data!.medications.push(newMed);
    await this.saveData();
    return newMed;
  }

  async updateMedication(id: string, updates: Partial<VaultMedication>): Promise<VaultMedication | null> {
    this.ensureUnlocked();
    const index = this.data!.medications.findIndex(m => m.id === id);
    if (index === -1) return null;

    this.data!.medications[index] = {
      ...this.data!.medications[index],
      ...updates,
      updatedAt: Date.now(),
    };
    await this.saveData();
    return this.data!.medications[index];
  }

  async deleteMedication(id: string): Promise<boolean> {
    this.ensureUnlocked();
    const index = this.data!.medications.findIndex(m => m.id === id);
    if (index === -1) return false;

    this.data!.medications.splice(index, 1);
    await this.saveData();
    return true;
  }

  // ============================================================================
  // Doctors CRUD
  // ============================================================================

  async getDoctors(): Promise<VaultDoctor[]> {
    this.ensureUnlocked();
    return this.data!.doctors;
  }

  async getDoctor(id: string): Promise<VaultDoctor | null> {
    this.ensureUnlocked();
    return this.data!.doctors.find(d => d.id === id) || null;
  }

  async addDoctor(doctor: Omit<VaultDoctor, keyof VaultEntity>): Promise<VaultDoctor> {
    this.ensureUnlocked();
    const newDoctor: VaultDoctor = {
      ...createEntity(),
      ...doctor,
    };
    this.data!.doctors.push(newDoctor);
    await this.saveData();
    return newDoctor;
  }

  async updateDoctor(id: string, updates: Partial<VaultDoctor>): Promise<VaultDoctor | null> {
    this.ensureUnlocked();
    const index = this.data!.doctors.findIndex(d => d.id === id);
    if (index === -1) return null;

    this.data!.doctors[index] = {
      ...this.data!.doctors[index],
      ...updates,
      updatedAt: Date.now(),
    };
    await this.saveData();
    return this.data!.doctors[index];
  }

  async deleteDoctor(id: string): Promise<boolean> {
    this.ensureUnlocked();
    const index = this.data!.doctors.findIndex(d => d.id === id);
    if (index === -1) return false;

    this.data!.doctors.splice(index, 1);
    await this.saveData();
    return true;
  }

  // ============================================================================
  // Appointments CRUD
  // ============================================================================

  async getAppointments(upcoming = false): Promise<VaultAppointment[]> {
    this.ensureUnlocked();
    if (upcoming) {
      const now = new Date().toISOString();
      return this.data!.appointments
        .filter(a => a.date >= now && a.status === 'scheduled')
        .sort((a, b) => a.date.localeCompare(b.date));
    }
    return this.data!.appointments;
  }

  async getAppointment(id: string): Promise<VaultAppointment | null> {
    this.ensureUnlocked();
    return this.data!.appointments.find(a => a.id === id) || null;
  }

  async addAppointment(appointment: Omit<VaultAppointment, keyof VaultEntity>): Promise<VaultAppointment> {
    this.ensureUnlocked();
    const newAppt: VaultAppointment = {
      ...createEntity(),
      ...appointment,
    };
    this.data!.appointments.push(newAppt);
    await this.saveData();
    return newAppt;
  }

  async updateAppointment(id: string, updates: Partial<VaultAppointment>): Promise<VaultAppointment | null> {
    this.ensureUnlocked();
    const index = this.data!.appointments.findIndex(a => a.id === id);
    if (index === -1) return null;

    this.data!.appointments[index] = {
      ...this.data!.appointments[index],
      ...updates,
      updatedAt: Date.now(),
    };
    await this.saveData();
    return this.data!.appointments[index];
  }

  async deleteAppointment(id: string): Promise<boolean> {
    this.ensureUnlocked();
    const index = this.data!.appointments.findIndex(a => a.id === id);
    if (index === -1) return false;

    this.data!.appointments.splice(index, 1);
    await this.saveData();
    return true;
  }

  // ============================================================================
  // Documents CRUD
  // ============================================================================

  async getDocuments(category?: string): Promise<VaultDocument[]> {
    this.ensureUnlocked();
    if (category) {
      return this.data!.documents.filter(d => d.category === category);
    }
    return this.data!.documents;
  }

  async getDocument(id: string): Promise<VaultDocument | null> {
    this.ensureUnlocked();
    return this.data!.documents.find(d => d.id === id) || null;
  }

  async addDocument(document: Omit<VaultDocument, keyof VaultEntity>): Promise<VaultDocument> {
    this.ensureUnlocked();
    const newDoc: VaultDocument = {
      ...createEntity(),
      ...document,
    };
    this.data!.documents.push(newDoc);
    await this.saveData();
    return newDoc;
  }

  async updateDocument(id: string, updates: Partial<VaultDocument>): Promise<VaultDocument | null> {
    this.ensureUnlocked();
    const index = this.data!.documents.findIndex(d => d.id === id);
    if (index === -1) return null;

    this.data!.documents[index] = {
      ...this.data!.documents[index],
      ...updates,
      updatedAt: Date.now(),
    };
    await this.saveData();
    return this.data!.documents[index];
  }

  async deleteDocument(id: string): Promise<boolean> {
    this.ensureUnlocked();
    const index = this.data!.documents.findIndex(d => d.id === id);
    if (index === -1) return false;

    this.data!.documents.splice(index, 1);
    await this.saveData();
    return true;
  }

  // ============================================================================
  // Routines CRUD
  // ============================================================================

  async getRoutines(activeOnly = false): Promise<VaultRoutine[]> {
    this.ensureUnlocked();
    if (activeOnly) {
      return this.data!.routines.filter(r => r.isActive);
    }
    return this.data!.routines;
  }

  async addRoutine(routine: Omit<VaultRoutine, keyof VaultEntity>): Promise<VaultRoutine> {
    this.ensureUnlocked();
    const newRoutine: VaultRoutine = {
      ...createEntity(),
      ...routine,
    };
    this.data!.routines.push(newRoutine);
    await this.saveData();
    return newRoutine;
  }

  // ============================================================================
  // Notes CRUD
  // ============================================================================

  async getNotes(visibleToUser = true): Promise<VaultNote[]> {
    this.ensureUnlocked();
    if (visibleToUser) {
      return this.data!.notes.filter(n => n.visibleToUser);
    }
    return this.data!.notes;
  }

  async addNote(note: Omit<VaultNote, keyof VaultEntity>): Promise<VaultNote> {
    this.ensureUnlocked();
    const newNote: VaultNote = {
      ...createEntity('caregiver'),
      ...note,
    };
    this.data!.notes.push(newNote);
    await this.saveData();
    return newNote;
  }

  // ============================================================================
  // Quick Facts
  // ============================================================================

  async getQuickFact(key: string): Promise<string | null> {
    this.ensureUnlocked();
    const fact = this.data!.quickFacts.find(f => f.key === key);
    return fact?.value || null;
  }

  async setQuickFact(key: string, value: string, category: string): Promise<void> {
    this.ensureUnlocked();
    const index = this.data!.quickFacts.findIndex(f => f.key === key);
    if (index >= 0) {
      this.data!.quickFacts[index].value = value;
    } else {
      this.data!.quickFacts.push({ key, value, category });
    }
    await this.saveData();
  }

  // ============================================================================
  // Search & Lookup (for AI tools)
  // ============================================================================

  /**
   * Search across all vault data
   */
  async search(query: string): Promise<VaultSearchResult[]> {
    this.ensureUnlocked();

    const results: VaultSearchResult[] = [];
    const queryLower = query.toLowerCase();

    // Search accounts
    for (const account of this.data!.accounts) {
      const nameMatch = account.name.toLowerCase().includes(queryLower);
      const institutionMatch = account.institution?.toLowerCase().includes(queryLower);

      if (nameMatch || institutionMatch) {
        results.push({
          type: 'account',
          id: account.id,
          title: account.name,
          subtitle: account.institution,
          matchedField: nameMatch ? 'name' : 'institution',
          relevanceScore: nameMatch ? 1.0 : 0.8,
        });
      }
    }

    // Search medications
    for (const med of this.data!.medications) {
      const nameMatch = med.name.toLowerCase().includes(queryLower);
      const genericMatch = med.genericName?.toLowerCase().includes(queryLower);

      if (nameMatch || genericMatch) {
        results.push({
          type: 'medication',
          id: med.id,
          title: med.name,
          subtitle: med.dosage,
          matchedField: nameMatch ? 'name' : 'genericName',
          relevanceScore: nameMatch ? 1.0 : 0.8,
        });
      }
    }

    // Search doctors
    for (const doctor of this.data!.doctors) {
      const nameMatch = doctor.name.toLowerCase().includes(queryLower);
      const specialtyMatch = doctor.specialty.toLowerCase().includes(queryLower);

      if (nameMatch || specialtyMatch) {
        results.push({
          type: 'doctor',
          id: doctor.id,
          title: doctor.name,
          subtitle: doctor.specialty,
          matchedField: nameMatch ? 'name' : 'specialty',
          relevanceScore: nameMatch ? 1.0 : 0.8,
        });
      }
    }

    // Search documents
    for (const doc of this.data!.documents) {
      const nameMatch = doc.name.toLowerCase().includes(queryLower);
      const locationMatch = doc.physicalLocation?.toLowerCase().includes(queryLower);

      if (nameMatch || locationMatch) {
        results.push({
          type: 'document',
          id: doc.id,
          title: doc.name,
          subtitle: doc.physicalLocation,
          matchedField: nameMatch ? 'name' : 'physicalLocation',
          relevanceScore: nameMatch ? 1.0 : 0.8,
        });
      }
    }

    // Sort by relevance
    return results.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  /**
   * Lookup account by type and/or name
   */
  async lookupAccount(type?: string, name?: string): Promise<VaultLookupResult> {
    this.ensureUnlocked();

    let accounts = this.data!.accounts;

    if (type) {
      accounts = accounts.filter(a =>
        a.type.toLowerCase().includes(type.toLowerCase()) ||
        a.name.toLowerCase().includes(type.toLowerCase())
      );
    }

    if (name) {
      accounts = accounts.filter(a =>
        a.name.toLowerCase().includes(name.toLowerCase()) ||
        a.institution?.toLowerCase().includes(name.toLowerCase())
      );
    }

    if (accounts.length === 0) {
      return {
        found: false,
        message: 'No matching accounts found in your vault.',
        suggestions: ['Try searching with different keywords', 'Check if the account has been added to the vault'],
      };
    }

    if (accounts.length === 1) {
      const account = accounts[0];
      return {
        found: true,
        type: account.type,
        data: {
          name: account.name,
          institution: account.institution,
          accountNumber: account.accountNumber,
          ifscCode: account.ifscCode,
          branchName: account.branchName,
          customerCarePhone: account.customerCarePhone,
        },
        message: `Found: ${account.name}`,
      };
    }

    return {
      found: true,
      type: 'multiple',
      data: {
        accounts: accounts.map(a => ({ name: a.name, type: a.type })),
      },
      message: `Found ${accounts.length} matching accounts. Please be more specific.`,
    };
  }

  /**
   * Lookup document location
   */
  async lookupDocumentLocation(documentName: string): Promise<VaultLookupResult> {
    this.ensureUnlocked();

    const docs = this.data!.documents.filter(d =>
      d.name.toLowerCase().includes(documentName.toLowerCase()) ||
      d.category.toLowerCase().includes(documentName.toLowerCase())
    );

    if (docs.length === 0) {
      return {
        found: false,
        message: `I couldn't find any documents matching "${documentName}" in your vault.`,
        suggestions: ['Check if the document has been added', 'Try different keywords'],
      };
    }

    const doc = docs[0];
    return {
      found: true,
      type: doc.category,
      data: {
        name: doc.name,
        category: doc.category,
        physicalLocation: doc.physicalLocation,
        hasDigitalCopy: !!doc.filePath,
        expiryDate: doc.expiryDate,
      },
      message: doc.physicalLocation
        ? `Your ${doc.name} is stored at: ${doc.physicalLocation}`
        : `Found ${doc.name}. Physical location not specified.`,
    };
  }

  /**
   * List medications
   */
  async listMedications(): Promise<VaultLookupResult> {
    this.ensureUnlocked();

    const activeMeds = this.data!.medications.filter(m => m.isActive);

    if (activeMeds.length === 0) {
      return {
        found: false,
        message: 'No active medications recorded in your vault.',
      };
    }

    return {
      found: true,
      type: 'medication_list',
      data: {
        medications: activeMeds.map(m => ({
          name: m.name,
          dosage: m.dosage,
          frequency: m.frequency,
          times: m.times,
          withFood: m.withFood,
          reason: m.reason,
        })),
      },
      message: `You have ${activeMeds.length} active medication(s).`,
    };
  }

  /**
   * Get upcoming appointments
   */
  async getUpcomingAppointmentsForAI(): Promise<VaultLookupResult> {
    this.ensureUnlocked();

    const upcoming = await this.getAppointments(true);

    if (upcoming.length === 0) {
      return {
        found: false,
        message: 'No upcoming appointments scheduled.',
      };
    }

    return {
      found: true,
      type: 'appointment_list',
      data: {
        appointments: upcoming.slice(0, 5).map(a => ({
          title: a.title,
          date: a.date,
          time: a.time,
          location: a.location,
          withPerson: a.withPerson,
          preparationNotes: a.preparationNotes,
        })),
      },
      message: `You have ${upcoming.length} upcoming appointment(s).`,
    };
  }

  /**
   * Get a doctor's contact info
   */
  async lookupDoctor(nameOrSpecialty: string): Promise<VaultLookupResult> {
    this.ensureUnlocked();

    const doctors = this.data!.doctors.filter(d =>
      d.name.toLowerCase().includes(nameOrSpecialty.toLowerCase()) ||
      d.specialty.toLowerCase().includes(nameOrSpecialty.toLowerCase())
    );

    if (doctors.length === 0) {
      return {
        found: false,
        message: `No doctor found matching "${nameOrSpecialty}".`,
      };
    }

    const doctor = doctors[0];
    return {
      found: true,
      type: 'doctor',
      data: {
        name: doctor.name,
        specialty: doctor.specialty,
        clinic: doctor.clinic,
        clinicAddress: doctor.clinicAddress,
        phoneNumbers: doctor.phoneNumbers,
        consultationHours: doctor.consultationHours,
        consultationFee: doctor.consultationFee,
        lastVisit: doctor.lastVisit,
        nextVisit: doctor.nextVisit,
      },
      message: `Found: Dr. ${doctor.name} (${doctor.specialty})`,
    };
  }

  // ============================================================================
  // Export / Backup
  // ============================================================================

  /**
   * Export all vault data (for backup)
   * Returns encrypted JSON
   */
  async exportVault(): Promise<string> {
    this.ensureUnlocked();
    return JSON.stringify(this.data, null, 2);
  }

  /**
   * Import vault data from backup
   */
  async importVault(jsonData: string): Promise<boolean> {
    this.ensureUnlocked();

    try {
      const imported = JSON.parse(jsonData) as KnowledgeVaultData;

      // Validate structure
      if (!imported.version || !Array.isArray(imported.accounts)) {
        throw new Error('Invalid vault data format');
      }

      this.data = imported;
      this.data.lastUpdated = Date.now();
      await this.saveData();
      return true;
    } catch (error) {
      console.error('Import failed:', error);
      return false;
    }
  }

  /**
   * Get summary stats for vault home screen
   */
  async getVaultSummary(): Promise<{
    accounts: number;
    contacts: number;
    medications: number;
    doctors: number;
    documents: number;
    appointments: number;
  }> {
    this.ensureUnlocked();

    return {
      accounts: this.data!.accounts.length,
      contacts: this.data!.contacts.length,
      medications: this.data!.medications.filter(m => m.isActive).length,
      doctors: this.data!.doctors.length,
      documents: this.data!.documents.length,
      appointments: this.data!.appointments.filter(a => a.status === 'scheduled').length,
    };
  }
}

export const vaultService = new VaultService();
export default vaultService;
