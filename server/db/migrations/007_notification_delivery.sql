-- Migration 007 — push-delivery tracking for notification_queue.
--
-- The queue previously had only pull-based consumption (GET /notifications,
-- status 'pending' → 'sent' acting as a read marker). The notification worker
-- (server/notificationWorker.js) now pushes due notifications over WebSocket
-- (+ email for high/urgent user notifications). delivered_at records the push
-- so a notification is pushed exactly once while remaining visible to pull
-- clients until read; delivery_error keeps the last failure for retry/triage.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS.

ALTER TABLE notification_queue ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE notification_queue ADD COLUMN IF NOT EXISTS delivery_error TEXT;

CREATE INDEX IF NOT EXISTS idx_notification_queue_undelivered
  ON notification_queue (created_at)
  WHERE status = 'pending' AND delivered_at IS NULL;
