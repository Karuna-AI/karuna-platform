export interface AdminUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  is_active: boolean;
  suspended_at?: string;
  suspended_reason?: string;
  last_login_at?: string;
  created_at: string;
  circle_count?: number;
  login_count?: number;
}

export interface AdminCircle {
  id: string;
  name: string;
  care_recipient_name: string;
  is_active: boolean;
  subscription_tier?: string;
  created_at: string;
  member_count?: number;
  owner_name?: string;
  role?: string;
  joined_at?: string;
}

export interface CircleMember {
  id: string;
  user_id: string;
  circle_id: string;
  name: string;
  email: string;
  role: 'owner' | 'caregiver' | 'viewer';
  status: 'active' | 'inactive';
  joined_at?: string;
}

export interface CircleStats {
  medications: number;
  appointments: number;
  notes: number;
  health_records: number;
  active_alerts: number;
}

export interface FeatureFlag {
  id: string;
  name: string;
  description?: string;
  is_enabled: boolean;
  enabled_for_all: boolean;
  rollout_percentage: number;
  created_at: string;
  updated_at?: string;
}

export interface SystemSetting {
  key: string;
  value: unknown;
  description?: string;
  type?: string;
  category?: string;
  updated_at?: string;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  admin_id?: string;
  user_id?: string;
  admin_name?: string;
  user_name?: string;
  circle_name?: string;
  details?: Record<string, unknown>;
  created_at: string;
  ip_address?: string;
}

export interface HealthAlert {
  id: string;
  circle_id: string;
  circle_name?: string;
  care_recipient_name?: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  status: 'active' | 'acknowledged' | 'resolved';
  created_at: string;
  acknowledged_at?: string;
  resolved_at?: string;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

// ---------------------------------------------------------------------------
// Admin API response payloads (mirror server/admin.js response shapes)
// ---------------------------------------------------------------------------

/**
 * Discriminated result: `data` is defined whenever `success` is true, so
 * `if (result.success) { result.data... }` narrows without extra checks.
 */
export type ApiResult<T> =
  | { success: true; data: T; error?: undefined }
  | { success: false; data?: undefined; error?: string };

export type AdminRole = 'super_admin' | 'admin' | 'support';

export interface AdminAccount {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  created_at: string;
}

export interface AdminSession {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  permissions: Record<string, boolean>;
}

// Auth
export interface LoginPayload {
  success: boolean;
  token: string;
  admin: AdminSession;
}

// Users
export interface UsersListPayload {
  users: AdminUser[];
  pagination: Pagination;
}

export interface UserDetailPayload {
  user: AdminUser;
  circles: AdminCircle[];
  recentActivity: AuditLogEntry[];
}

export interface CreateUserPayload {
  success: boolean;
  user?: AdminUser;
  // NOTE: server also returns the plaintext temp password here (security
  // finding M4, owned by the security track). Typed as optional so call sites
  // don't depend on it.
  tempPassword?: string;
}

// Circles
export interface CirclesListPayload {
  circles: AdminCircle[];
  pagination: Pagination;
}

export interface CirclePayload {
  circle: AdminCircle;
}

export interface CircleDetailPayload {
  circle: AdminCircle;
  members: CircleMember[];
  stats: CircleStats;
}

// Dashboard
export interface DashboardMetricsPayload {
  users: { total: number; active: number; new_last_month: number; active_last_week: number };
  circles: { total: number; avg_members: number };
  alerts: { active: number; critical: number; high: number };
  activity: { total_activities: number; active_circles: number };
  timestamp: string;
}

// Feature flags
export interface FeatureFlagsPayload {
  flags: FeatureFlag[];
}

export interface FeatureFlagPayload {
  flag: FeatureFlag;
}

// Audit logs
export interface AuditLogsPayload {
  logs: AuditLogEntry[];
  pagination?: Pagination;
}

// Settings — GET /settings returns rows grouped by category
// (server/admin.js groups system_settings by row.category).
export interface SettingsPayload {
  settings: Record<string, SystemSetting[]>;
}

// Admin management
export interface AdminsPayload {
  admins: AdminAccount[];
}

export interface CreateAdminPayload {
  success: boolean;
  admin: AdminAccount;
}

/** Generic shape for mutation endpoints that return `{ success: true }`. */
export interface MutationPayload {
  success: boolean;
}
