-- Karuna Platform — Time-Series Data Archival
-- Run once against your PostgreSQL database.
-- After archiving, rows are moved (not copied) from live tables to archive tables.
-- Retention defaults (can be overridden via system_settings):
--   health_data      365 days
--   medication_doses 365 days
--   activity_logs     90 days
--   checkin_logs      90 days

-- ============================================================================
-- Archive Tables
-- ============================================================================

CREATE TABLE IF NOT EXISTS health_data_archive (LIKE health_data INCLUDING ALL);
ALTER TABLE health_data_archive DROP CONSTRAINT IF EXISTS health_data_archive_circle_id_fkey;
CREATE INDEX IF NOT EXISTS idx_health_data_archive_circle ON health_data_archive(circle_id);
CREATE INDEX IF NOT EXISTS idx_health_data_archive_measured ON health_data_archive(measured_at);

CREATE TABLE IF NOT EXISTS medication_doses_archive (LIKE medication_doses INCLUDING ALL);
ALTER TABLE medication_doses_archive DROP CONSTRAINT IF EXISTS medication_doses_archive_circle_id_fkey;
ALTER TABLE medication_doses_archive DROP CONSTRAINT IF EXISTS medication_doses_archive_medication_id_fkey;
CREATE INDEX IF NOT EXISTS idx_medication_doses_archive_circle ON medication_doses_archive(circle_id);
CREATE INDEX IF NOT EXISTS idx_medication_doses_archive_scheduled ON medication_doses_archive(scheduled_time);

CREATE TABLE IF NOT EXISTS activity_logs_archive (LIKE activity_logs INCLUDING ALL);
ALTER TABLE activity_logs_archive DROP CONSTRAINT IF EXISTS activity_logs_archive_circle_id_fkey;
CREATE INDEX IF NOT EXISTS idx_activity_logs_archive_circle ON activity_logs_archive(circle_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_archive_recorded ON activity_logs_archive(recorded_at);

CREATE TABLE IF NOT EXISTS checkin_logs_archive (LIKE checkin_logs INCLUDING ALL);
ALTER TABLE checkin_logs_archive DROP CONSTRAINT IF EXISTS checkin_logs_archive_circle_id_fkey;
CREATE INDEX IF NOT EXISTS idx_checkin_logs_archive_circle ON checkin_logs_archive(circle_id);
CREATE INDEX IF NOT EXISTS idx_checkin_logs_archive_created ON checkin_logs_archive(created_at);

-- ============================================================================
-- Archival Stored Procedure
-- ============================================================================

CREATE OR REPLACE FUNCTION archive_old_data(
  health_retention_days   INTEGER DEFAULT 365,
  dose_retention_days     INTEGER DEFAULT 365,
  activity_retention_days INTEGER DEFAULT 90,
  checkin_retention_days  INTEGER DEFAULT 90
) RETURNS TABLE(
  table_name TEXT,
  rows_archived BIGINT
) LANGUAGE plpgsql AS $$
DECLARE
  v_health_cutoff   TIMESTAMP WITH TIME ZONE;
  v_dose_cutoff     TIMESTAMP WITH TIME ZONE;
  v_activity_cutoff TIMESTAMP WITH TIME ZONE;
  v_checkin_cutoff  TIMESTAMP WITH TIME ZONE;
  v_count           BIGINT;
BEGIN
  v_health_cutoff   := NOW() - (health_retention_days   || ' days')::INTERVAL;
  v_dose_cutoff     := NOW() - (dose_retention_days     || ' days')::INTERVAL;
  v_activity_cutoff := NOW() - (activity_retention_days || ' days')::INTERVAL;
  v_checkin_cutoff  := NOW() - (checkin_retention_days  || ' days')::INTERVAL;

  -- Archive health_data
  WITH moved AS (
    DELETE FROM health_data
    WHERE measured_at < v_health_cutoff
    RETURNING *
  )
  INSERT INTO health_data_archive SELECT * FROM moved;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN QUERY SELECT 'health_data'::TEXT, v_count;

  -- Archive medication_doses
  WITH moved AS (
    DELETE FROM medication_doses
    WHERE scheduled_time < v_dose_cutoff
    RETURNING *
  )
  INSERT INTO medication_doses_archive SELECT * FROM moved;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN QUERY SELECT 'medication_doses'::TEXT, v_count;

  -- Archive activity_logs
  WITH moved AS (
    DELETE FROM activity_logs
    WHERE recorded_at < v_activity_cutoff
    RETURNING *
  )
  INSERT INTO activity_logs_archive SELECT * FROM moved;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN QUERY SELECT 'activity_logs'::TEXT, v_count;

  -- Archive checkin_logs
  WITH moved AS (
    DELETE FROM checkin_logs
    WHERE created_at < v_checkin_cutoff
    RETURNING *
  )
  INSERT INTO checkin_logs_archive SELECT * FROM moved;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN QUERY SELECT 'checkin_logs'::TEXT, v_count;
END;
$$;
