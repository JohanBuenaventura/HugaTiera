-- ============================================================================
-- Migration 013: Third-Party Payment Gateway Tracking (PayMongo + Sandbox/Demo)
-- Target: MySQL 8.x (XAMPP / InnoDB)
-- Preserves all existing manual payment proof records (gateway_provider = 'manual').
-- ============================================================================

ALTER TABLE booking_payments
  MODIFY COLUMN payment_method ENUM('gcash', 'maya', 'grab_pay', 'card', 'bank_transfer', 'cash', 'other') NOT NULL DEFAULT 'gcash',
  ADD COLUMN gateway_provider ENUM('manual', 'paymongo', 'sandbox_demo') NOT NULL DEFAULT 'manual' AFTER payment_method,
  ADD COLUMN gateway_session_id VARCHAR(120) NULL AFTER gateway_provider,
  ADD COLUMN gateway_checkout_url VARCHAR(500) NULL AFTER gateway_session_id,
  ADD COLUMN gateway_status ENUM('none', 'awaiting_payment', 'paid', 'failed', 'cancelled') NOT NULL DEFAULT 'none' AFTER gateway_checkout_url,
  ADD COLUMN gateway_paid_at TIMESTAMP NULL AFTER gateway_status,
  ADD INDEX idx_booking_payments_gateway_session (gateway_session_id);
