-- Rollback Migration 007: Remove booking_payments and reservation/payment columns

DROP TABLE IF EXISTS booking_payments;

ALTER TABLE bookings
  DROP COLUMN paid_at,
  DROP COLUMN amount_paid,
  DROP COLUMN required_deposit_amount,
  DROP COLUMN payment_status,
  DROP COLUMN booking_stage;

ALTER TABLE agreements
  DROP COLUMN required_deposit_amount;
