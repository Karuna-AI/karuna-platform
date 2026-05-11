export interface AdminUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  is_active: boolean;
  suspended_at?: string;
  last_login_at?: string;
  created_at: string;
  circle_count?: number;
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
