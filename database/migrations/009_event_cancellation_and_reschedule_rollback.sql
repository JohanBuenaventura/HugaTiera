-- Rollback Migration 009: Remove event-based cancellation columns and booking_reschedule_requests table

DROP TABLE IF EXISTS booking_reschedule_requests;

ALTER TABLE bookings
  DROP FOREIGN KEY fk_bookings_cancelled_by,
  DROP COLUMN cancelled_at,
  DROP COLUMN cancelled_by,
  DROP COLUMN cancellation_reason,
  DROP COLUMN cancellation_reason_type;
