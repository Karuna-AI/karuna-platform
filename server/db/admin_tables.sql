-- Admin Panel Database Tables
-- Run this migration to add admin functionality

-- ============================================================================
-- Admin Users Table (separate from regular users for security)
-- ============================================================================
CREATE TABLE IF NOT EXISTS admin_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'admin' CHECK (role IN ('super_admin', 'admin', 'support')),
    is_active BOOLEAN DEFAULT true,
    last_login_at TIMESTAMP WITH TIME ZONE,
    login_count INTEGER DEFAULT 0,
    created_by UUID REFERENCES admin_users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_admin_users_email ON admin_users(email);

-- ============================================================================
-- System Settings Table (global configuration)
-- ============================================================================
CREATE TABLE IF NOT EXISTS system_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key VARCHAR(100) UNIQUE NOT NULL,
    value JSONB NOT NULL,
    description TEXT,
    category VARCHAR(50) DEFAULT 'general', -- general, security, notifications, ai, limits
    is_sensitive BOOLEAN DEFAULT false,
    updated_by UUID REFERENCES admin_users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_system_settings_key ON system_settings(key);
CREATE INDEX idx_system_settings_category ON system_settings(category);

-- ============================================================================
-- Feature Flags Table (control features per user/global)
-- ============================================================================
CREATE TABLE IF NOT EXISTS feature_flags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    is_enabled BOOLEAN DEFAULT false,
    enabled_for_all BOOLEAN DEFAULT false,
    enabled_user_ids UUID[] DEFAULT '{}',
    enabled_circle_ids UUID[] DEFAULT '{}',
    rollout_percentage INTEGER DEFAULT 0 CHECK (rollout_percentage >= 0 AND rollout_percentage <= 100),
    metadata JSONB DEFAULT '{}',
    created_by UUID REFERENCES admin_users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_feature_flags_name ON feature_flags(name);

-- ============================================================================
-- System Metrics Table (aggregated stats for dashboard)
-- ============================================================================
CREATE TABLE IF NOT EXISTS system_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    metric_date DATE NOT NULL,
    metric_type VARCHAR(50) NOT NULL, -- daily_active_users, api_calls, errors, ai_tokens, etc.
    metric_value JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(metric_date, metric_type)
);

CREATE INDEX idx_system_metrics_date ON system_metrics(metric_date);
CREATE INDEX idx_system_metrics_type ON system_metrics(metric_type);

-- ============================================================================
-- Admin Audit Log Table (track admin actions)
-- ============================================================================
CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_id UUID REFERENCES admin_users(id),
    admin_email VARCHAR(255),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50), -- user, circle, setting, feature_flag, etc.
    resource_id UUID,
    old_value JSONB,
    new_value JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_admin_audit_logs_admin ON admin_audit_logs(admin_id);
CREATE INDEX idx_admin_audit_logs_action ON admin_audit_logs(action);
CREATE INDEX idx_admin_audit_logs_resource ON admin_audit_logs(resource_type, resource_id);
CREATE INDEX idx_admin_audit_logs_created ON admin_audit_logs(created_at DESC);

-- ============================================================================
-- Notifications Queue Table (for admin-triggered notifications)
-- ============================================================================
CREATE TABLE IF NOT EXISTS notification_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recipient_type VARCHAR(20) NOT NULL CHECK (recipient_type IN ('user', 'circle', 'all')),
    recipient_id UUID,
    notification_type VARCHAR(50) NOT NULL, -- system_announcement, maintenance, feature_update
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    priority VARCHAR(20) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
    scheduled_at TIMESTAMP WITH TIME ZONE,
    sent_at TIMESTAMP WITH TIME ZONE,
    created_by UUID REFERENCES admin_users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notification_queue_status ON notification_queue(status);
CREATE INDEX idx_notification_queue_scheduled ON notification_queue(scheduled_at);

-- ============================================================================
-- User Status Extension (add admin-controlled fields to users)
-- ============================================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_reason TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_by UUID;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS login_count INTEGER DEFAULT 0;

-- ============================================================================
-- Care Circle Status Extension
-- ============================================================================
ALTER TABLE care_circles ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE care_circles ADD COLUMN IF NOT EXISTS subscription_tier VARCHAR(20) DEFAULT 'free';
ALTER TABLE care_circles ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMP WITH TIME ZONE;

-- ============================================================================
-- AI Usage Logs Table (tracks AI API calls for analytics)
-- ============================================================================
CREATE TABLE IF NOT EXISTS ai_usage_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    circle_id UUID REFERENCES care_circles(id),
    request_type VARCHAR(20) NOT NULL, -- chat, stt, tts
    model VARCHAR(100) NOT NULL,
    prompt_tokens INTEGER DEFAULT 0,
    completion_tokens INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    estimated_cost_usd DECIMAL(10, 6) DEFAULT 0,
    latency_ms INTEGER,
    success BOOLEAN DEFAULT true,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ai_usage_logs_created ON ai_usage_logs(created_at DESC);
CREATE INDEX idx_ai_usage_logs_type ON ai_usage_logs(request_type);
CREATE INDEX idx_ai_usage_logs_user ON ai_usage_logs(user_id);

-- ============================================================================
-- Triggers for updated_at
-- ============================================================================
CREATE TRIGGER update_admin_users_updated_at BEFORE UPDATE ON admin_users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_system_settings_updated_at BEFORE UPDATE ON system_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_feature_flags_updated_at BEFORE UPDATE ON feature_flags FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Default System Settings
-- ============================================================================
INSERT INTO system_settings (key, value, description, category) VALUES
    ('max_circles_per_user', '5', 'Maximum care circles a user can create', 'limits'),
    ('max_members_per_circle', '10', 'Maximum members allowed per care circle', 'limits'),
    ('session_timeout_hours', '168', 'User session timeout in hours (7 days)', 'security'),
    ('ai_daily_token_limit', '50000', 'Daily AI token limit per user', 'ai'),
    ('enable_voice_features', 'true', 'Enable voice input/output features', 'general'),
    ('enable_health_sync', 'true', 'Enable health data sync from devices', 'general'),
    ('maintenance_mode', 'false', 'Put system in maintenance mode', 'general'),
    ('maintenance_message', '"System is under maintenance. Please try again later."', 'Message shown during maintenance', 'general')
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- Default Feature Flags
-- ============================================================================
INSERT INTO feature_flags (name, description, is_enabled, enabled_for_all) VALUES
    ('proactive_checkins', 'Enable proactive wellness check-ins', true, true),
    ('medication_reminders', 'Enable medication reminder notifications', true, true),
    ('voice_conversations', 'Enable voice-based conversations with AI', true, true),
    ('health_monitoring', 'Enable health data monitoring and alerts', true, true),
    ('caregiver_alerts', 'Enable real-time alerts to caregivers', true, true),
    ('ai_memory', 'Enable AI conversation memory', true, true),
    ('emergency_sos', 'Enable emergency SOS feature', true, true),
    ('dark_mode', 'Enable dark mode UI option', false, false),
    ('beta_features', 'Access to beta features', false, false)
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- Create default super admin (CHANGE PASSWORD IN PRODUCTION!)
-- Password hash generated with bcryptjs - update via seed script or API
-- ============================================================================
-- Note: You should create the admin user through the API or manually update the password hash
