-- Migration 009: Event-based cancellation reasons (client or gardener)
-- and mutual reschedule (move date) requests for reservations and bookings

ALTER TABLE bookings
  ADD COLUMN cancellation_reason_type ENUM(
    'typhoon_weather',
    'accident_emergency',
    'schedule_conflict',
    'scope_or_plan_change',
    'property_access_issue',
    'other'
  ) NULL AFTER completion_agreement_notes,
  ADD COLUMN cancellation_reason VARCHAR(1000) NULL AFTER cancellation_reason_type,
  ADD COLUMN cancelled_by INT UNSIGNED NULL AFTER cancellation_reason,
  ADD COLUMN cancelled_at TIMESTAMP NULL AFTER cancelled_by,
  ADD CONSTRAINT fk_bookings_cancelled_by FOREIGN KEY (cancelled_by) REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE booking_reschedule_requests (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  booking_id INT UNSIGNED NOT NULL,
  requested_by INT UNSIGNED NOT NULL,
  reason_type ENUM(
    'typhoon_weather',
    'accident_emergency',
    'schedule_conflict',
    'scope_or_plan_change',
    'property_access_issue',
    'other'
  ) NOT NULL,
  reason_details VARCHAR(1000) NOT NULL,
  previous_start DATETIME NOT NULL,
  previous_end DATETIME NOT NULL,
  proposed_start DATETIME NOT NULL,
  proposed_end DATETIME NOT NULL,
  status ENUM('pending', 'approved', 'declined', 'cancelled') NOT NULL DEFAULT 'pending',
  responded_by INT UNSIGNED NULL,
  responded_at TIMESTAMP NULL,
  response_note VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_reschedule_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  CONSTRAINT fk_reschedule_requester FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_reschedule_responder FOREIGN KEY (responded_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT chk_reschedule_proposed_schedule CHECK (proposed_end > proposed_start),
  INDEX idx_reschedule_booking_status (booking_id, status, created_at)
) ENGINE=InnoDB;
