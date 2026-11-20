-- Rollback Migration 008: Remove transaction completion agreement columns and transaction_code

ALTER TABLE bookings
  DROP COLUMN completion_agreement_notes,
  DROP COLUMN transaction_closed_at,
  DROP COLUMN gardener_completion_confirmed_at,
  DROP COLUMN client_completion_confirmed_at,
  DROP COLUMN transaction_status;

ALTER TABLE booking_payments
  DROP COLUMN transaction_code;
