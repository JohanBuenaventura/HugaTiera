-- Migration 007: Add Reservation vs. Paid Booking lifecycle, configurable deposit on agreements,
-- and offline/direct payment proof + gardener verification table

ALTER TABLE agreements
  ADD COLUMN required_deposit_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00 AFTER amount;

UPDATE agreements
  SET required_deposit_amount = ROUND(amount * 0.30, 2)
  WHERE required_deposit_amount = 0.00 AND amount > 0;

ALTER TABLE bookings
  ADD COLUMN booking_stage ENUM('reserved', 'booked') NOT NULL DEFAULT 'reserved' AFTER status,
  ADD COLUMN payment_status ENUM('unpaid', 'pending_verification', 'partially_paid', 'fully_paid') NOT NULL DEFAULT 'unpaid' AFTER booking_stage,
  ADD COLUMN required_deposit_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00 AFTER payment_status,
  ADD COLUMN amount_paid DECIMAL(10, 2) NOT NULL DEFAULT 0.00 AFTER required_deposit_amount,
  ADD COLUMN paid_at TIMESTAMP NULL AFTER amount_paid;

UPDATE bookings b
  LEFT JOIN agreements a ON a.id = b.agreement_id
  SET b.required_deposit_amount = COALESCE(a.required_deposit_amount, 0.00),
      b.booking_stage = IF(b.status IN ('in_progress', 'completed'), 'booked', 'reserved'),
      b.payment_status = IF(b.status = 'completed', 'fully_paid', IF(b.status = 'in_progress', 'partially_paid', 'unpaid'));

CREATE TABLE booking_payments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  booking_id INT UNSIGNED NOT NULL,
  submitted_by INT UNSIGNED NOT NULL,
  payment_type ENUM('partial', 'full', 'balance') NOT NULL DEFAULT 'partial',
  payment_method ENUM('gcash', 'maya', 'bank_transfer', 'cash', 'other') NOT NULL DEFAULT 'gcash',
  amount DECIMAL(10, 2) NOT NULL,
  reference_number VARCHAR(100) NULL,
  receipt_path VARCHAR(255) NULL,
  notes VARCHAR(500) NULL,
  status ENUM('pending', 'verified', 'rejected') NOT NULL DEFAULT 'pending',
  verified_by INT UNSIGNED NULL,
  verified_at TIMESTAMP NULL,
  rejection_reason VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_booking_payments_booking (booking_id, status, created_at)
) ENGINE=InnoDB;
