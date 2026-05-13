-- Migration 001: Add patient_consent column to care_circles
-- Stores the patient's consent preferences synced from their mobile device.
-- Used by the API to enforce data access restrictions for non-owner caregivers.

ALTER TABLE care_circles
  ADD COLUMN IF NOT EXISTS patient_consent JSONB DEFAULT '{}';
