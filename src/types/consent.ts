/**
 * Consent Framework Types
 * Defines data categories, consent records, and sharing scopes
 */

// Data categories that require consent
export type ConsentCategory =
  | 'health_data'         // Medical records, medications, health conditions
  | 'financial_data'      // Bank accounts, pension, insurance
  | 'personal_documents'  // ID cards, legal documents
  | 'contact_info'        // Phone numbers, addresses, emergency contacts
  | 'location_data'       // Location history, frequently visited places
  | 'voice_data'          // Voice recordings, transcripts
  | 'usage_analytics'     // App usage patterns for improvement
  | 'caregiver_sharing';  // Sharing data with care circle members

// Who can access the data
export type ConsentGrantee =
  | 'app'                 // The Karuna app itself
  | 'ai_assistant'        // AI processing for responses
  | 'caregiver_owner'     // Care circle owner
  | 'caregiver_member'    // Care circle caregivers
  | 'caregiver_viewer'    // Care circle viewers
  | 'analytics'           // Anonymous analytics
  | 'backup_service';     // Cloud backup

// Access level for a category
export type AccessLevel =
  | 'none'                // No access
  | 'read'                // Can view data
  | 'write'               // Can view and modify data
  | 'full';               // Full access including delete

// Individual consent record
export interface ConsentRecord {
  id: string;
  category: ConsentCategory;
  grantee: ConsentGrantee;
  accessLevel: AccessLevel;
  grantedAt: string;
  expiresAt?: string;     // Optional expiration
  revokedAt?: string;     // If consent was revoked
  lastUsedAt?: string;    // When this consent was last exercised
  scope?: ConsentScope;   // Specific restrictions
  reason?: string;        // Why this consent was requested
  version: number;        // For tracking consent updates
}

// Specific scope restrictions for a consent
export interface ConsentScope {
  // For health data
  includesMedications?: boolean;
  includesConditions?: boolean;
  includesDoctors?: boolean;
  includesAppointments?: boolean;

  // For financial data
  includesAccounts?: boolean;
  includesBalances?: boolean;
  includesTransactions?: boolean;

  // For documents
  includesIdDocuments?: boolean;
  includesLegalDocuments?: boolean;
  includesMedicalRecords?: boolean;

  // For contacts
  includesEmergencyContacts?: boolean;
  includesFamilyContacts?: boolean;
  includesAllContacts?: boolean;

  // For caregiver sharing
  allowedCaregiverIds?: string[];
  allowedRoles?: ('owner' | 'caregiver' | 'viewer')[];

  // Time restrictions
  activeHoursStart?: string;  // e.g., "09:00"
  activeHoursEnd?: string;    // e.g., "21:00"
}

// User's overall consent preferences
export interface ConsentPreferences {
  userId: string;
  consents: ConsentRecord[];
  defaultAccessLevels: Record<ConsentCategory, AccessLevel>;
  lastReviewedAt: string;
  nextReviewReminder?: string;
  globalDataSharing: boolean;  // Master switch for all sharing
  createdAt: string;
  updatedAt: string;
}

// Request for consent (shown to user)
export interface ConsentRequest {
  id: string;
  category: ConsentCategory;
  grantee: ConsentGrantee;
  requestedAccessLevel: AccessLevel;
  reason: string;
  requiredForFeature?: string;
  isRequired: boolean;  // Can user decline?
  suggestedScope?: ConsentScope;
}

// Response to a consent request
export interface ConsentResponse {
  requestId: string;
  granted: boolean;
  accessLevel?: AccessLevel;
  customScope?: ConsentScope;
  expiresAt?: string;
}

// Consent change event for audit
export interface ConsentChangeEvent {
  timestamp: string;
  action: 'granted' | 'revoked' | 'updated' | 'expired';
  category: ConsentCategory;
  grantee: ConsentGrantee;
  previousAccessLevel?: AccessLevel;
  newAccessLevel?: AccessLevel;
  initiatedBy: 'user' | 'system' | 'caregiver';
  reason?: string;
}

// Summary of current consent status
export interface ConsentSummary {
  category: ConsentCategory;
  displayName: string;
  description: string;
  icon: string;
  currentAccess: {
    grantee: ConsentGrantee;
    accessLevel: AccessLevel;
    grantedAt?: string;
  }[];
  requiresReview: boolean;
  lastChangedAt?: string;
}

// Category metadata for UI display
export const CONSENT_CATEGORY_INFO: Record<ConsentCategory, {
  displayName: string;
  description: string;
  icon: string;
  sensitivity: 'low' | 'medium' | 'high' | 'critical';
  examples: string[];
}> = {
  health_data: {
    displayName: 'Health Information',
    description: 'Medical records, medications, health conditions, and doctor information',
    icon: '💊',
    sensitivity: 'critical',
    examples: ['Medication schedules', 'Doctor appointments', 'Health conditions'],
  },
  financial_data: {
    displayName: 'Financial Information',
    description: 'Bank accounts, pension details, insurance policies',
    icon: '🏦',
    sensitivity: 'critical',
    examples: ['Bank account numbers', 'Pension amounts', 'Insurance policies'],
  },
  personal_documents: {
    displayName: 'Personal Documents',
    description: 'Identity documents, legal papers, certificates',
    icon: '📄',
    sensitivity: 'high',
    examples: ['Aadhaar card', 'PAN card', 'Property documents'],
  },
  contact_info: {
    displayName: 'Contact Information',
    description: 'Phone numbers, addresses, and contact details',
    icon: '📞',
    sensitivity: 'medium',
    examples: ['Family phone numbers', 'Emergency contacts', 'Home address'],
  },
  location_data: {
    displayName: 'Location Data',
    description: 'Current location and location history',
    icon: '📍',
    sensitivity: 'high',
    examples: ['Current location', 'Frequent places', 'Location sharing'],
  },
  voice_data: {
    displayName: 'Voice & Conversations',
    description: 'Voice recordings and conversation transcripts',
    icon: '🎤',
    sensitivity: 'medium',
    examples: ['Voice commands', 'Conversation history', 'Speech patterns'],
  },
  usage_analytics: {
    displayName: 'Usage Analytics',
    description: 'Anonymous app usage data to improve the experience',
    icon: '📊',
    sensitivity: 'low',
    examples: ['Feature usage', 'App performance', 'Error reports'],
  },
  caregiver_sharing: {
    displayName: 'Caregiver Sharing',
    description: 'Sharing your information with family caregivers',
    icon: '👨‍👩‍👧',
    sensitivity: 'high',
    examples: ['Share medications', 'Share appointments', 'Share emergency info'],
  },
};

// Grantee metadata for UI display
export const CONSENT_GRANTEE_INFO: Record<ConsentGrantee, {
  displayName: string;
  description: string;
}> = {
  app: {
    displayName: 'Karuna App',
    description: 'Basic app functionality and local storage',
  },
  ai_assistant: {
    displayName: 'AI Assistant',
    description: 'AI processing to answer your questions',
  },
  caregiver_owner: {
    displayName: 'Family Owner',
    description: 'The primary family caregiver managing your care',
  },
  caregiver_member: {
    displayName: 'Family Caregivers',
    description: 'Family members helping with your care',
  },
  caregiver_viewer: {
    displayName: 'Family Viewers',
    description: 'Family members who can view your information',
  },
  analytics: {
    displayName: 'Analytics Service',
    description: 'Anonymous usage data to improve Karuna',
  },
  backup_service: {
    displayName: 'Backup Service',
    description: 'Secure cloud backup of your data',
  },
};
