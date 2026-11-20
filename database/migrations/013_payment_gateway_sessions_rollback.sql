-- ============================================================================
-- Rollback 013: Remove Third-Party Payment Gateway Columns from booking_payments
-- ============================================================================

UPDATE booking_payments
SET payment_method = 'other'
WHERE payment_method IN ('grab_pay', 'card');

ALTER TABLE booking_payments
  DROP INDEX idx_booking_payments_gateway_session,
  DROP COLUMN gateway_paid_at,
  DROP COLUMN gateway_status,
  DROP COLUMN gateway_checkout_url,
  DROP COLUMN gateway_session_id,
  DROP COLUMN gateway_provider,
  MODIFY COLUMN payment_method ENUM('gcash', 'maya', 'bank_transfer', 'cash', 'other') NOT NULL DEFAULT 'gcash';
