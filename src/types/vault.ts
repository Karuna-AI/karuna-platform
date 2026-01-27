/**
 * Knowledge Vault Types
 *
 * Secure storage for personal information that the AI can reference
 * to answer questions like "What's my SBI account number?"
 */

// ============================================================================
// Base Types
// ============================================================================

export interface VaultEntity {
  id: string;
  createdAt: number;
  updatedAt: number;
  createdBy: 'user' | 'caregiver';
  notes?: string;
  tags?: string[];
}

// ============================================================================
// Accounts (Bank, ID, Insurance)
// ============================================================================

export type AccountType =
  | 'bank'
  | 'credit_card'
  | 'insurance'
  | 'government_id'
  | 'utility'
  | 'subscription'
  | 'other';

export interface VaultAccount extends VaultEntity {
  type: AccountType;
  name: string; // e.g., "SBI Savings Account", "Aadhar Card"
  institution?: string; // e.g., "State Bank of India"

  // Sensitive fields (encrypted)
  accountNumber?: string;
  ifscCode?: string;
  cardNumber?: string; // last 4 digits only recommended
  policyNumber?: string;
  idNumber?: string;

  // Non-sensitive
  branchName?: string;
  branchAddress?: string;
  customerCarePhone?: string;
  expiryDate?: string;
  renewalDate?: string;

  // For insurance
  coverage?: string;
  premium?: string;
  premiumDueDate?: string;
  nomineeNames?: string[];

  // Document references
  documentIds?: string[];
}

// ============================================================================
// Contacts with Extended Relationships
// ============================================================================

export type RelationshipType =
  | 'spouse'
  | 'son'
  | 'daughter'
  | 'grandchild'
  | 'sibling'
  | 'parent'
  | 'friend'
  | 'neighbor'
  | 'caregiver'
  | 'doctor'
  | 'lawyer'
  | 'accountant'
  | 'helper'
  | 'other';

export interface VaultContact extends VaultEntity {
  name: string;
  relationship: RelationshipType;
  relationshipDetails?: string; // e.g., "eldest son", "family doctor"
  nickname?: string;

  // Contact info
  phoneNumbers: {
    label: string; // "mobile", "home", "work"
    number: string;
    isPrimary: boolean;
  }[];
  email?: string;
  address?: string;

  // Additional details
  birthday?: string;
  anniversary?: string;
  occupation?: string;
  workplace?: string;

  // For professional contacts
  specialty?: string; // e.g., "Cardiologist" for doctors
  clinic?: string;
  consultationFee?: string;

  // Caregiver specific
  caregiverAccess?: boolean;
  accessLevel?: 'read' | 'read_write' | 'admin';
  canReceiveAlerts?: boolean;
}

// ============================================================================
// Medications
// ============================================================================

export type MedicationFrequency =
  | 'once_daily'
  | 'twice_daily'
  | 'thrice_daily'
  | 'four_times_daily'
  | 'weekly'
  | 'as_needed'
  | 'custom';

export interface VaultMedication extends VaultEntity {
  name: string;
  genericName?: string;
  strength?: string; // e.g., "500mg"
  form?: string; // "tablet", "capsule", "syrup", "injection"

  // Dosage
  dosage: string; // e.g., "1 tablet"
  frequency: MedicationFrequency;
  customSchedule?: string; // if frequency is 'custom'
  times?: string[]; // e.g., ["8:00 AM", "8:00 PM"]
  withFood?: boolean;
  instructions?: string;

  // Prescription info
  prescribedBy?: string; // doctor name
  prescribedDate?: string;
  reason?: string; // what condition it treats

  // Supply info
  currentSupply?: number;
  refillDate?: string;
  pharmacy?: string;
  pharmacyPhone?: string;

  // Status
  isActive: boolean;
  startDate?: string;
  endDate?: string;

  // Document references
  prescriptionDocId?: string;
}

// ============================================================================
// Routines / Daily Schedule
// ============================================================================

export type RoutineType =
  | 'morning'
  | 'afternoon'
  | 'evening'
  | 'night'
  | 'medication'
  | 'exercise'
  | 'therapy'
  | 'appointment'
  | 'other';

export interface VaultRoutine extends VaultEntity {
  name: string;
  type: RoutineType;
  description?: string;

  // Timing
  time?: string; // e.g., "8:00 AM"
  duration?: number; // in minutes
  daysOfWeek?: number[]; // 0 = Sunday, 6 = Saturday

  // Reminders
  reminderEnabled: boolean;
  reminderMinutesBefore?: number;

  // Linked entities
  linkedMedicationIds?: string[];
  linkedContactIds?: string[];

  isActive: boolean;
}

// ============================================================================
// Doctors / Healthcare Providers
// ============================================================================

export type DoctorSpecialty =
  | 'general_physician'
  | 'cardiologist'
  | 'neurologist'
  | 'orthopedic'
  | 'ophthalmologist'
  | 'ent'
  | 'dentist'
  | 'dermatologist'
  | 'psychiatrist'
  | 'physiotherapist'
  | 'other';

export interface VaultDoctor extends VaultEntity {
  name: string;
  specialty: DoctorSpecialty;
  specialtyOther?: string;

  // Contact
  clinic: string;
  clinicAddress?: string;
  phoneNumbers: string[];
  email?: string;

  // Scheduling
  consultationDays?: string; // e.g., "Mon-Fri"
  consultationHours?: string; // e.g., "10 AM - 2 PM"
  appointmentRequired?: boolean;
  consultationFee?: string;

  // For regular visits
  lastVisit?: string;
  nextVisit?: string;
  visitFrequency?: string; // e.g., "Every 3 months"

  // Conditions they treat for this user
  treatingConditions?: string[];

  // Linked medications prescribed by this doctor
  prescribedMedicationIds?: string[];
}

// ============================================================================
// Appointments
// ============================================================================

export type AppointmentType =
  | 'doctor'
  | 'hospital'
  | 'lab_test'
  | 'therapy'
  | 'government'
  | 'bank'
  | 'legal'
  | 'social'
  | 'other';

export interface VaultAppointment extends VaultEntity {
  title: string;
  type: AppointmentType;
  description?: string;

  // When
  date: string; // ISO date string
  time: string;
  duration?: number; // in minutes
  isAllDay?: boolean;

  // Where
  location?: string;
  address?: string;

  // Who
  withPerson?: string;
  linkedDoctorId?: string;
  linkedContactId?: string;

  // Reminders
  reminderEnabled: boolean;
  reminderMinutesBefore?: number[];

  // Status
  status: 'scheduled' | 'completed' | 'cancelled' | 'rescheduled';
  completedNotes?: string;

  // Recurring
  isRecurring?: boolean;
  recurringPattern?: string;

  // Preparation
  preparationNotes?: string; // e.g., "Fasting required"
  documentsToCarry?: string[];
}

// ============================================================================
// Documents
// ============================================================================

export type DocumentCategory =
  | 'id_proof'
  | 'address_proof'
  | 'medical'
  | 'insurance'
  | 'bank'
  | 'property'
  | 'legal'
  | 'prescription'
  | 'lab_report'
  | 'photo'
  | 'other';

export interface VaultDocument extends VaultEntity {
  name: string;
  category: DocumentCategory;
  description?: string;

  // File info
  fileName?: string;
  fileType?: string; // "pdf", "image/jpeg", etc.
  fileSize?: number;
  filePath?: string; // local path or base64 for small files

  // For quick reference
  thumbnailPath?: string;
  textContent?: string; // OCR text for searchability

  // Physical location (for "where are my documents" questions)
  physicalLocation?: string; // e.g., "Bedroom almirah, top shelf"
  physicalCopy?: boolean;

  // Linked entities
  linkedAccountId?: string;
  linkedDoctorId?: string;

  // Validity
  issueDate?: string;
  expiryDate?: string;

  // Security
  isEncrypted: boolean;
}

// ============================================================================
// Caregiver Notes
// ============================================================================

export interface VaultNote extends VaultEntity {
  title: string;
  content: string;
  author: string; // caregiver name

  // Categorization
  category?: 'observation' | 'instruction' | 'concern' | 'update' | 'reminder';
  priority?: 'low' | 'medium' | 'high';

  // Linking
  linkedEntityType?: 'medication' | 'doctor' | 'routine' | 'appointment';
  linkedEntityId?: string;

  // Visibility
  visibleToUser: boolean;
  visibleToCaregivers: boolean;

  // Follow up
  requiresFollowUp?: boolean;
  followUpDate?: string;
  resolved?: boolean;
}

// ============================================================================
// Vault Data Container
// ============================================================================

export interface KnowledgeVaultData {
  version: number;
  lastUpdated: number;

  accounts: VaultAccount[];
  contacts: VaultContact[];
  medications: VaultMedication[];
  routines: VaultRoutine[];
  doctors: VaultDoctor[];
  appointments: VaultAppointment[];
  documents: VaultDocument[];
  notes: VaultNote[];

  // Quick access for common questions
  quickFacts: {
    key: string; // e.g., "blood_type", "allergies"
    value: string;
    category: string;
  }[];
}

// ============================================================================
// Search Results
// ============================================================================

export interface VaultSearchResult {
  type: 'account' | 'contact' | 'medication' | 'doctor' | 'document' | 'appointment' | 'routine' | 'note' | 'quick_fact';
  id: string;
  title: string;
  subtitle?: string;
  matchedField: string;
  relevanceScore: number;
}

// ============================================================================
// AI Tool Results
// ============================================================================

export interface VaultLookupResult {
  found: boolean;
  type?: string;
  data?: Record<string, any>;
  message: string;
  suggestions?: string[];
}
