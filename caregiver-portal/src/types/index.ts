// Care Circle Types for Caregiver Portal

export type CareCircleRole = 'owner' | 'caregiver' | 'viewer';

export interface User {
  id: string;
  email: string;
  name: string;
  phone?: string;
  createdAt: string;
}

export interface CareCircle {
  id: string;
  name: string;
  elderlyName: string;
  elderlyId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CareCircleMember {
  id: string;
  careCircleId: string;
  userId: string;
  role: CareCircleRole;
  name: string;
  email: string;
  phone?: string;
  joinedAt: string;
  lastActiveAt?: string;
  permissions: RolePermissions;
}

export interface RolePermissions {
  canViewVault: boolean;
  canEditVault: boolean;
  canViewSensitive: boolean;
  canInviteMembers: boolean;
  canRemoveMembers: boolean;
  canEditCircle: boolean;
  canDeleteCircle: boolean;
  canAddNotes: boolean;
  canViewNotes: boolean;
}

export interface CareCircleInvitation {
  id: string;
  careCircleId: string;
  email: string;
  role: CareCircleRole;
  invitedBy: string;
  token: string;
  expiresAt: string;
  acceptedAt?: string;
  status: 'pending' | 'accepted' | 'expired' | 'cancelled';
}

// Vault Types (read-only view for caregivers)
export interface VaultAccount {
  id: string;
  type: 'bank' | 'pension' | 'insurance' | 'utility' | 'subscription' | 'other';
  name: string;
  accountNumber?: string;
  ifscCode?: string;
  balance?: number;
  notes?: string;
  documents?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface VaultMedication {
  id: string;
  name: string;
  dosage: string;
  frequency: string;
  timing: string[];
  prescribedBy?: string;
  purpose?: string;
  startDate?: string;
  endDate?: string;
  refillDate?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface VaultDoctor {
  id: string;
  name: string;
  specialty: string;
  hospital?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface VaultAppointment {
  id: string;
  doctorId?: string;
  doctorName: string;
  purpose: string;
  date: string;
  time: string;
  location?: string;
  notes?: string;
  reminder?: boolean;
  status: 'scheduled' | 'completed' | 'cancelled';
  createdAt: string;
  updatedAt: string;
}

export interface VaultContact {
  id: string;
  name: string;
  relationship: string;
  phone?: string;
  email?: string;
  address?: string;
  isEmergency: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface VaultNote {
  id: string;
  title: string;
  content: string;
  category: 'general' | 'medical' | 'financial' | 'personal' | 'reminder';
  authorId: string;
  authorName: string;
  createdAt: string;
  updatedAt: string;
}

export interface VaultDocument {
  id: string;
  name: string;
  type: 'id' | 'medical' | 'financial' | 'legal' | 'other';
  description?: string;
  fileUri?: string;
  thumbnail?: string;
  createdAt: string;
  updatedAt: string;
}

// Sync Types
export interface SyncData {
  accounts: VaultAccount[];
  medications: VaultMedication[];
  doctors: VaultDoctor[];
  appointments: VaultAppointment[];
  contacts: VaultContact[];
  notes: VaultNote[];
  documents: VaultDocument[];
  lastSyncedAt: string;
}

export interface SyncChange {
  id: string;
  entityType: string;
  entityId: string;
  action: 'create' | 'update' | 'delete';
  data: Record<string, unknown>;
  timestamp: string;
  deviceId: string;
  userId: string;
}

// Auth Types
export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  name: string;
  email: string;
  password: string;
  phone?: string;
}

// Health Data Types
export interface HealthReading {
  id: string;
  circleId: string;
  dataType: string;
  value: Record<string, number>;
  unit?: string;
  measuredAt: string;
  source?: string;
  notes?: string;
  createdAt: string;
}

export interface HealthDataResponse {
  data: Record<string, HealthReading[]>;
  latest: Record<string, HealthReading>;
  period: { days: number; since: string };
}

// Medication Adherence Types
export interface MedicationDose {
  id: string;
  circleId: string;
  medicationId: string;
  medicationName: string;
  scheduledTime: string;
  status: 'pending' | 'taken' | 'missed' | 'skipped';
  takenAt?: string;
  skippedReason?: string;
  notes?: string;
}

export interface AdherenceSummary {
  adherenceRate: number;
  totalDoses: number;
  takenDoses: number;
  missedDoses: number;
  skippedDoses: number;
  pendingDoses: number;
}

export interface AdherenceResponse {
  summary: AdherenceSummary;
  medications: VaultMedication[];
  byMedication: {
    medicationId: string;
    medicationName: string;
    taken: number;
    missed: number;
    skipped: number;
    pending: number;
  }[];
  todaysDoses: MedicationDose[];
  recentDoses: MedicationDose[];
  period: { days: number; since: string };
}

// Activity Monitoring Types
export interface ActivityLog {
  id: string;
  circleId: string;
  activityType: string;
  details?: Record<string, unknown>;
  recordedAt: string;
  source: string;
  createdAt: string;
}

export interface ActivityResponse {
  lastActivity: ActivityLog | null;
  lastActiveAt: string | null;
  inactivityMinutes: number | null;
  inactivityStatus: 'active' | 'normal' | 'concerning' | 'alert' | 'unknown';
  activityLogs: ActivityLog[];
  byType: Record<string, ActivityLog[]>;
  dailyCounts: Record<string, number>;
  period: { days: number; since: string };
}

// Caregiver Alerts Types
export interface CaregiverAlert {
  id: string;
  circleId: string;
  alertType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  data?: Record<string, unknown>;
  status: 'active' | 'acknowledged' | 'resolved' | 'dismissed';
  acknowledgedBy?: string;
  acknowledgedByName?: string;
  acknowledgedAt?: string;
  resolvedAt?: string;
  createdAt: string;
}

export interface AlertsResponse {
  alerts: CaregiverAlert[];
  counts: { low: number; medium: number; high: number; critical: number };
  totalActive: number;
}

// Check-in Types
export interface CheckinLog {
  id: string;
  circleId: string;
  checkinType: string;
  message: string;
  response?: string;
  responseText?: string;
  respondedAt?: string;
  triggeredBy?: Record<string, unknown>;
  createdAt: string;
}

export interface CheckinsResponse {
  checkins: CheckinLog[];
  summary: { total: number; responded: number; responseRate: number };
  byType: Record<string, { total: number; responded: number }>;
  period: { days: number; since: string };
}

// Dashboard Summary Types
export interface DashboardData {
  health: { latest: HealthReading[] };
  adherence: {
    today: {
      taken: number;
      missed: number;
      skipped: number;
      pending: number;
      rate: number;
    };
  };
  activity: {
    lastActivity: ActivityLog | null;
    inactivityMinutes: number | null;
    inactivityStatus: string;
  };
  alerts: { active: CaregiverAlert[]; count: number };
  checkins: { responseRate: number; total: number; responded: number };
  timestamp: string;
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
