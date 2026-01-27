/**
 * Care Circle Types
 *
 * Defines the data models for multi-caregiver collaboration
 * including roles, permissions, invitations, and sync.
 */

// ============================================================================
// Roles & Permissions
// ============================================================================

export type CareCircleRole = 'owner' | 'caregiver' | 'viewer';

export interface RolePermissions {
  // Vault access
  canViewAccounts: boolean;
  canEditAccounts: boolean;
  canViewMedications: boolean;
  canEditMedications: boolean;
  canViewDocuments: boolean;
  canEditDocuments: boolean;
  canViewDoctors: boolean;
  canEditDoctors: boolean;
  canViewAppointments: boolean;
  canEditAppointments: boolean;
  canViewContacts: boolean;
  canEditContacts: boolean;

  // Notes
  canAddNotes: boolean;
  canViewAllNotes: boolean;

  // Admin
  canInviteMembers: boolean;
  canRemoveMembers: boolean;
  canChangeRoles: boolean;
  canExportData: boolean;
  canDeleteCircle: boolean;
}

export const ROLE_PERMISSIONS: Record<CareCircleRole, RolePermissions> = {
  owner: {
    canViewAccounts: true,
    canEditAccounts: true,
    canViewMedications: true,
    canEditMedications: true,
    canViewDocuments: true,
    canEditDocuments: true,
    canViewDoctors: true,
    canEditDoctors: true,
    canViewAppointments: true,
    canEditAppointments: true,
    canViewContacts: true,
    canEditContacts: true,
    canAddNotes: true,
    canViewAllNotes: true,
    canInviteMembers: true,
    canRemoveMembers: true,
    canChangeRoles: true,
    canExportData: true,
    canDeleteCircle: true,
  },
  caregiver: {
    canViewAccounts: true,
    canEditAccounts: false,
    canViewMedications: true,
    canEditMedications: true,
    canViewDocuments: true,
    canEditDocuments: false,
    canViewDoctors: true,
    canEditDoctors: true,
    canViewAppointments: true,
    canEditAppointments: true,
    canViewContacts: true,
    canEditContacts: true,
    canAddNotes: true,
    canViewAllNotes: true,
    canInviteMembers: false,
    canRemoveMembers: false,
    canChangeRoles: false,
    canExportData: true,
    canDeleteCircle: false,
  },
  viewer: {
    canViewAccounts: false, // Sensitive - viewers can't see
    canEditAccounts: false,
    canViewMedications: true,
    canEditMedications: false,
    canViewDocuments: false,
    canEditDocuments: false,
    canViewDoctors: true,
    canEditDoctors: false,
    canViewAppointments: true,
    canEditAppointments: false,
    canViewContacts: true,
    canEditContacts: false,
    canAddNotes: true,
    canViewAllNotes: false, // Can only see own notes
    canInviteMembers: false,
    canRemoveMembers: false,
    canChangeRoles: false,
    canExportData: false,
    canDeleteCircle: false,
  },
};

// ============================================================================
// Care Circle Members
// ============================================================================

export interface CareCircleMember {
  id: string;
  email: string;
  name: string;
  phone?: string;
  role: CareCircleRole;
  relationship?: string; // e.g., "Son", "Daughter", "Nurse"
  avatarUrl?: string;

  // Status
  status: 'invited' | 'active' | 'inactive';
  invitedAt: number;
  joinedAt?: number;
  lastActiveAt?: number;

  // Notification preferences
  notifyOnMedicationChanges: boolean;
  notifyOnAppointments: boolean;
  notifyOnEmergency: boolean;
  notifyOnNotes: boolean;
}

// ============================================================================
// Care Circle (the "family" unit)
// ============================================================================

export interface CareCircle {
  id: string;
  name: string; // e.g., "Caring for Mom"
  createdAt: number;
  updatedAt: number;

  // The person being cared for
  careRecipient: {
    id: string;
    name: string;
    deviceId?: string;
    lastSyncAt?: number;
  };

  // Members of the circle
  members: CareCircleMember[];

  // Settings
  settings: {
    allowDeviceSync: boolean;
    requireApprovalForChanges: boolean;
    syncIntervalSeconds: number;
  };
}

// ============================================================================
// Invitations
// ============================================================================

export interface CareCircleInvitation {
  id: string;
  circleId: string;
  circleName: string;
  invitedBy: string;
  invitedByName: string;
  email: string;
  role: CareCircleRole;
  relationship?: string;
  createdAt: number;
  expiresAt: number;
  token: string; // Secure token for accepting
  status: 'pending' | 'accepted' | 'expired' | 'declined';
}

// ============================================================================
// Sync & Change Tracking
// ============================================================================

export type SyncEntityType =
  | 'account'
  | 'medication'
  | 'doctor'
  | 'appointment'
  | 'document'
  | 'contact'
  | 'routine'
  | 'note';

export type SyncAction = 'create' | 'update' | 'delete';

export interface SyncChange {
  id: string;
  circleId: string;
  entityType: SyncEntityType;
  entityId: string;
  action: SyncAction;
  data: Record<string, any>;
  previousData?: Record<string, any>;

  // Who made the change
  changedBy: string;
  changedByName: string;
  changedByRole: CareCircleRole;

  // When
  timestamp: number;
  version: number;

  // Sync status
  syncedToDevice: boolean;
  syncedAt?: number;
}

export interface SyncState {
  circleId: string;
  lastSyncVersion: number;
  lastSyncTimestamp: number;
  pendingChanges: SyncChange[];
  conflicts: SyncConflict[];
}

export interface SyncConflict {
  id: string;
  entityType: SyncEntityType;
  entityId: string;
  localChange: SyncChange;
  remoteChange: SyncChange;
  resolvedBy?: string;
  resolution?: 'local' | 'remote' | 'merged';
  resolvedAt?: number;
}

// ============================================================================
// Caregiver Notes
// ============================================================================

export interface CaregiverNote {
  id: string;
  circleId: string;
  authorId: string;
  authorName: string;
  authorRole: CareCircleRole;

  // Content
  title: string;
  content: string;
  category: 'observation' | 'instruction' | 'concern' | 'update' | 'reminder' | 'general';
  priority: 'low' | 'medium' | 'high' | 'urgent';

  // Linking to entities
  linkedEntityType?: SyncEntityType;
  linkedEntityId?: string;
  linkedEntityName?: string;

  // Visibility
  visibleToUser: boolean;
  visibleToAllCaregivers: boolean;
  visibleToRoles: CareCircleRole[];

  // Status
  requiresFollowUp: boolean;
  followUpDate?: string;
  resolved: boolean;
  resolvedBy?: string;
  resolvedAt?: number;

  // Timestamps
  createdAt: number;
  updatedAt: number;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

export interface CreateCircleRequest {
  name: string;
  careRecipientName: string;
}

export interface InviteMemberRequest {
  circleId: string;
  email: string;
  name: string;
  role: CareCircleRole;
  relationship?: string;
}

export interface SyncRequest {
  circleId: string;
  deviceId: string;
  lastSyncVersion: number;
  localChanges: SyncChange[];
}

export interface SyncResponse {
  success: boolean;
  currentVersion: number;
  changes: SyncChange[];
  conflicts: SyncConflict[];
}

export interface AuthResponse {
  success: boolean;
  token?: string;
  user?: {
    id: string;
    email: string;
    name: string;
  };
  circles?: CareCircle[];
  error?: string;
}

// ============================================================================
// WebSocket Events
// ============================================================================

export type WebSocketEventType =
  | 'connected'
  | 'sync_update'
  | 'member_joined'
  | 'member_left'
  | 'note_added'
  | 'change_pending'
  | 'conflict_detected'
  | 'emergency_alert';

export interface WebSocketEvent {
  type: WebSocketEventType;
  circleId: string;
  payload: Record<string, any>;
  timestamp: number;
}
