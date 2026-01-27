-- Karuna Platform Database Schema
-- PostgreSQL 16

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- Users Table
-- ============================================================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);

-- ============================================================================
-- Care Circles Table
-- ============================================================================
CREATE TABLE care_circles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    care_recipient_name VARCHAR(255) NOT NULL,
    care_recipient_device_id VARCHAR(255),
    care_recipient_last_sync_at TIMESTAMP WITH TIME ZONE,
    settings JSONB DEFAULT '{"allowDeviceSync": true, "requireApprovalForChanges": false, "syncIntervalSeconds": 30}',
    sync_version INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- Circle Members Table (Many-to-Many with roles)
-- ============================================================================
CREATE TABLE circle_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    circle_id UUID NOT NULL REFERENCES care_circles(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('owner', 'caregiver', 'viewer')),
    relationship VARCHAR(100),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending')),
    notify_on_medication_changes BOOLEAN DEFAULT true,
    notify_on_appointments BOOLEAN DEFAULT true,
    notify_on_emergency BOOLEAN DEFAULT true,
    notify_on_notes BOOLEAN DEFAULT true,
    invited_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_active_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(circle_id, user_id)
);

CREATE INDEX idx_circle_members_circle ON circle_members(circle_id);
CREATE INDEX idx_circle_members_user ON circle_members(user_id);

-- ============================================================================
-- Invitations Table
-- ============================================================================
CREATE TABLE invitations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    circle_id UUID NOT NULL REFERENCES care_circles(id) ON DELETE CASCADE,
    invited_by UUID NOT NULL REFERENCES users(id),
    email VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('caregiver', 'viewer')),
    relationship VARCHAR(100),
    token VARCHAR(255) UNIQUE NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_invitations_token ON invitations(token);
CREATE INDEX idx_invitations_email ON invitations(email);

-- ============================================================================
-- Vault: Accounts Table
-- ============================================================================
CREATE TABLE vault_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    circle_id UUID NOT NULL REFERENCES care_circles(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL, -- bank, credit_card, insurance, investment, pension, other
    institution VARCHAR(255),
    account_number_encrypted TEXT,
    ifsc_code VARCHAR(20),
    branch VARCHAR(255),
    nominee VARCHAR(255),
    notes TEXT,
    created_by VARCHAR(255),
    updated_by VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_vault_accounts_circle ON vault_accounts(circle_id);

-- ============================================================================
-- Vault: Medications Table
-- ============================================================================
CREATE TABLE vault_medications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    circle_id UUID NOT NULL REFERENCES care_circles(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    dosage VARCHAR(100),
    frequency VARCHAR(100), -- daily, twice_daily, weekly, as_needed
    timing TEXT[], -- array of times: ['08:00', '20:00']
    instructions TEXT,
    prescribing_doctor VARCHAR(255),
    pharmacy VARCHAR(255),
    refill_date DATE,
    is_active BOOLEAN DEFAULT true,
    created_by VARCHAR(255),
    updated_by VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_vault_medications_circle ON vault_medications(circle_id);

-- ============================================================================
-- Vault: Doctors Table
-- ============================================================================
CREATE TABLE vault_doctors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    circle_id UUID NOT NULL REFERENCES care_circles(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    specialty VARCHAR(100),
    hospital VARCHAR(255),
    phone VARCHAR(50),
    email VARCHAR(255),
    address TEXT,
    notes TEXT,
    is_primary BOOLEAN DEFAULT false,
    created_by VARCHAR(255),
    updated_by VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_vault_doctors_circle ON vault_doctors(circle_id);

-- ============================================================================
-- Vault: Appointments Table
-- ============================================================================
CREATE TABLE vault_appointments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    circle_id UUID NOT NULL REFERENCES care_circles(id) ON DELETE CASCADE,
    doctor_id UUID REFERENCES vault_doctors(id) ON DELETE SET NULL,
    doctor_name VARCHAR(255),
    date DATE NOT NULL,
    time TIME,
    location VARCHAR(255),
    purpose TEXT,
    preparation_notes TEXT,
    status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled', 'rescheduled')),
    reminder_sent BOOLEAN DEFAULT false,
    created_by VARCHAR(255),
    updated_by VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_vault_appointments_circle ON vault_appointments(circle_id);
CREATE INDEX idx_vault_appointments_date ON vault_appointments(date);

-- ============================================================================
-- Vault: Documents Table
-- ============================================================================
CREATE TABLE vault_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    circle_id UUID NOT NULL REFERENCES care_circles(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    type VARCHAR(50), -- id_proof, medical_record, insurance, legal, property, other
    description TEXT,
    file_name VARCHAR(255),
    file_type VARCHAR(50),
    file_size INTEGER,
    file_data_encrypted TEXT, -- Base64 encrypted file content
    expiry_date DATE,
    is_sensitive BOOLEAN DEFAULT false,
    created_by VARCHAR(255),
    updated_by VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_vault_documents_circle ON vault_documents(circle_id);

-- ============================================================================
-- Vault: Contacts Table
-- ============================================================================
CREATE TABLE vault_contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    circle_id UUID NOT NULL REFERENCES care_circles(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    relationship VARCHAR(100),
    phone VARCHAR(50),
    phone_alt VARCHAR(50),
    email VARCHAR(255),
    address TEXT,
    is_emergency BOOLEAN DEFAULT false,
    priority INTEGER DEFAULT 0, -- For emergency contact ordering
    notes TEXT,
    created_by VARCHAR(255),
    updated_by VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_vault_contacts_circle ON vault_contacts(circle_id);
CREATE INDEX idx_vault_contacts_emergency ON vault_contacts(circle_id, is_emergency);

-- ============================================================================
-- Vault: Routines Table
-- ============================================================================
CREATE TABLE vault_routines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    circle_id UUID NOT NULL REFERENCES care_circles(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    time TIME,
    days_of_week INTEGER[], -- 0=Sunday, 1=Monday, etc.
    category VARCHAR(50), -- morning, afternoon, evening, night, meal, exercise, medication
    is_active BOOLEAN DEFAULT true,
    created_by VARCHAR(255),
    updated_by VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_vault_routines_circle ON vault_routines(circle_id);

-- ============================================================================
-- Vault: Notes Table
-- ============================================================================
CREATE TABLE vault_notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    circle_id UUID NOT NULL REFERENCES care_circles(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES users(id),
    author_name VARCHAR(255) NOT NULL,
    author_role VARCHAR(20) NOT NULL,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    category VARCHAR(50) DEFAULT 'general', -- general, medical, financial, personal, reminder
    priority VARCHAR(20) DEFAULT 'medium', -- low, medium, high, urgent
    linked_entity_type VARCHAR(50), -- medication, appointment, doctor, etc.
    linked_entity_id UUID,
    linked_entity_name VARCHAR(255),
    visible_to_user BOOLEAN DEFAULT true,
    visible_to_all_caregivers BOOLEAN DEFAULT true,
    visible_to_roles TEXT[], -- ['owner', 'caregiver']
    requires_follow_up BOOLEAN DEFAULT false,
    follow_up_date DATE,
    resolved BOOLEAN DEFAULT false,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_vault_notes_circle ON vault_notes(circle_id);
CREATE INDEX idx_vault_notes_author ON vault_notes(author_id);
CREATE INDEX idx_vault_notes_category ON vault_notes(circle_id, category);

-- ============================================================================
-- Sync Changes Table (Audit Log)
-- ============================================================================
CREATE TABLE sync_changes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    circle_id UUID NOT NULL REFERENCES care_circles(id) ON DELETE CASCADE,
    entity_type VARCHAR(50) NOT NULL, -- account, medication, doctor, etc.
    entity_id UUID NOT NULL,
    action VARCHAR(20) NOT NULL CHECK (action IN ('create', 'update', 'delete')),
    data JSONB,
    changed_by UUID REFERENCES users(id),
    changed_by_name VARCHAR(255),
    changed_by_role VARCHAR(20),
    version INTEGER NOT NULL,
    synced_to_device BOOLEAN DEFAULT false,
    synced_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sync_changes_circle ON sync_changes(circle_id);
CREATE INDEX idx_sync_changes_version ON sync_changes(circle_id, version);
CREATE INDEX idx_sync_changes_entity ON sync_changes(entity_type, entity_id);

-- ============================================================================
-- Sessions Table (for tracking active sessions)
-- ============================================================================
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    device_info JSONB,
    ip_address VARCHAR(45),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_active_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_token ON sessions(token_hash);

-- ============================================================================
-- Health Data Table (synced from device)
-- ============================================================================
CREATE TABLE health_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    circle_id UUID NOT NULL REFERENCES care_circles(id) ON DELETE CASCADE,
    data_type VARCHAR(50) NOT NULL, -- blood_pressure, heart_rate, steps, weight, glucose, etc.
    value JSONB NOT NULL, -- { systolic: 120, diastolic: 80 } or { value: 72 }
    unit VARCHAR(20),
    measured_at TIMESTAMP WITH TIME ZONE NOT NULL,
    source VARCHAR(50), -- manual, apple_health, google_fit, device
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_health_data_circle ON health_data(circle_id);
CREATE INDEX idx_health_data_type ON health_data(circle_id, data_type);
CREATE INDEX idx_health_data_measured ON health_data(circle_id, measured_at);

-- ============================================================================
-- Medication Doses Table (tracks adherence)
-- ============================================================================
CREATE TABLE medication_doses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    circle_id UUID NOT NULL REFERENCES care_circles(id) ON DELETE CASCADE,
    medication_id UUID NOT NULL REFERENCES vault_medications(id) ON DELETE CASCADE,
    scheduled_time TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'taken', 'missed', 'skipped')),
    taken_at TIMESTAMP WITH TIME ZONE,
    skipped_reason TEXT,
    notes TEXT,
    synced_from_device BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_medication_doses_circle ON medication_doses(circle_id);
CREATE INDEX idx_medication_doses_medication ON medication_doses(medication_id);
CREATE INDEX idx_medication_doses_scheduled ON medication_doses(circle_id, scheduled_time);
CREATE INDEX idx_medication_doses_status ON medication_doses(circle_id, status);

-- ============================================================================
-- Activity Logs Table (tracks user engagement)
-- ============================================================================
CREATE TABLE activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    circle_id UUID NOT NULL REFERENCES care_circles(id) ON DELETE CASCADE,
    activity_type VARCHAR(50) NOT NULL, -- app_open, voice_interaction, check_in_response, medication_taken, etc.
    details JSONB,
    recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    source VARCHAR(50) DEFAULT 'device', -- device, caregiver_portal, system
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_activity_logs_circle ON activity_logs(circle_id);
CREATE INDEX idx_activity_logs_type ON activity_logs(circle_id, activity_type);
CREATE INDEX idx_activity_logs_recorded ON activity_logs(circle_id, recorded_at DESC);

-- ============================================================================
-- Caregiver Alerts Table (concerning patterns & notifications)
-- ============================================================================
CREATE TABLE caregiver_alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    circle_id UUID NOT NULL REFERENCES care_circles(id) ON DELETE CASCADE,
    alert_type VARCHAR(50) NOT NULL, -- missed_medication, inactivity, abnormal_vital, low_adherence, missed_checkin
    severity VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    data JSONB, -- Additional context data
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'acknowledged', 'resolved', 'dismissed')),
    acknowledged_by UUID REFERENCES users(id),
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    resolved_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_caregiver_alerts_circle ON caregiver_alerts(circle_id);
CREATE INDEX idx_caregiver_alerts_status ON caregiver_alerts(circle_id, status);
CREATE INDEX idx_caregiver_alerts_severity ON caregiver_alerts(circle_id, severity);
CREATE INDEX idx_caregiver_alerts_created ON caregiver_alerts(circle_id, created_at DESC);

-- ============================================================================
-- Check-in Logs Table (proactive check-in tracking)
-- ============================================================================
CREATE TABLE checkin_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    circle_id UUID NOT NULL REFERENCES care_circles(id) ON DELETE CASCADE,
    checkin_type VARCHAR(50) NOT NULL, -- wellness, medication_reminder, activity_nudge, hydration, rest
    message TEXT NOT NULL,
    response VARCHAR(50), -- positive, negative, dismissed, no_response
    response_text TEXT,
    responded_at TIMESTAMP WITH TIME ZONE,
    triggered_by JSONB, -- What signals triggered this check-in
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_checkin_logs_circle ON checkin_logs(circle_id);
CREATE INDEX idx_checkin_logs_type ON checkin_logs(circle_id, checkin_type);
CREATE INDEX idx_checkin_logs_created ON checkin_logs(circle_id, created_at DESC);

-- ============================================================================
-- Audit Log Table (for security events)
-- ============================================================================
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    circle_id UUID REFERENCES care_circles(id),
    action VARCHAR(100) NOT NULL,
    category VARCHAR(50) NOT NULL, -- auth, vault, care_circle, system
    description TEXT,
    metadata JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_circle ON audit_logs(circle_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at);

-- ============================================================================
-- Functions
-- ============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers to all tables with updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_care_circles_updated_at BEFORE UPDATE ON care_circles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_vault_accounts_updated_at BEFORE UPDATE ON vault_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_vault_medications_updated_at BEFORE UPDATE ON vault_medications FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_vault_doctors_updated_at BEFORE UPDATE ON vault_doctors FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_vault_appointments_updated_at BEFORE UPDATE ON vault_appointments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_vault_documents_updated_at BEFORE UPDATE ON vault_documents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_vault_contacts_updated_at BEFORE UPDATE ON vault_contacts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_vault_routines_updated_at BEFORE UPDATE ON vault_routines FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_vault_notes_updated_at BEFORE UPDATE ON vault_notes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Initial Data (Optional - for testing)
-- ============================================================================

-- You can add test data here if needed

COMMENT ON DATABASE karuna IS 'Karuna AI Companion Platform Database';
