-- Migration 008: Add payment transaction codes and mutual Transaction Completion Agreement
-- required alongside full payment before rating/reviewing a completed booking

ALTER TABLE booking_payments
  ADD COLUMN transaction_code VARCHAR(40) NULL UNIQUE AFTER id;

UPDATE booking_payments
  SET transaction_code = CONCAT('TXN-', DATE_FORMAT(created_at, '%Y%m%d'), '-', LPAD(id, 6, '0'))
  WHERE transaction_code IS NULL;

ALTER TABLE bookings
  ADD COLUMN transaction_status ENUM('open', 'pending_closure', 'closed') NOT NULL DEFAULT 'open' AFTER paid_at,
  ADD COLUMN client_completion_confirmed_at TIMESTAMP NULL AFTER transaction_status,
  ADD COLUMN gardener_completion_confirmed_at TIMESTAMP NULL AFTER client_completion_confirmed_at,
  ADD COLUMN transaction_closed_at TIMESTAMP NULL AFTER gardener_completion_confirmed_at,
  ADD COLUMN completion_agreement_notes TEXT NULL AFTER transaction_closed_at;

UPDATE bookings
  SET transaction_status = 'closed',
      client_completion_confirmed_at = COALESCE(updated_at, CURRENT_TIMESTAMP),
      gardener_completion_confirmed_at = COALESCE(updated_at, CURRENT_TIMESTAMP),
      transaction_closed_at = COALESCE(updated_at, CURRENT_TIMESTAMP)
  WHERE status = 'completed' AND payment_status = 'fully_paid' AND transaction_status = 'open';
