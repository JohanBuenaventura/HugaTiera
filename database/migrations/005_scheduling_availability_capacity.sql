-- Migration 005: Add gardener working days/hours, simultaneous job capacity,
-- unavailable/blocked dates, and estimated working days/hours on quotations & agreements

ALTER TABLE gardener_profiles
  ADD COLUMN working_days VARCHAR(64) NOT NULL DEFAULT 'mon,tue,wed,thu,fri,sat,sun' AFTER years_of_experience,
  ADD COLUMN work_start_time TIME NOT NULL DEFAULT '08:00:00' AFTER working_days,
  ADD COLUMN work_end_time TIME NOT NULL DEFAULT '17:00:00' AFTER work_start_time,
  ADD COLUMN max_concurrent_jobs TINYINT UNSIGNED NOT NULL DEFAULT 1 AFTER work_end_time,
  ADD COLUMN availability_notes VARCHAR(255) NULL AFTER max_concurrent_jobs;

CREATE TABLE gardener_unavailable_dates (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  gardener_id INT UNSIGNED NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (gardener_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_unavailable_dates_range CHECK (end_date >= start_date),
  INDEX idx_gardener_unavailable_range (gardener_id, start_date, end_date)
) ENGINE=InnoDB;

ALTER TABLE quotations
  ADD COLUMN estimated_working_days DECIMAL(4, 1) NULL AFTER availability_end,
  ADD COLUMN estimated_hours DECIMAL(5, 1) NULL AFTER estimated_working_days;

ALTER TABLE quotation_revisions
  ADD COLUMN estimated_working_days DECIMAL(4, 1) NULL AFTER availability_end,
  ADD COLUMN estimated_hours DECIMAL(5, 1) NULL AFTER estimated_working_days;

ALTER TABLE agreements
  ADD COLUMN estimated_working_days DECIMAL(4, 1) NULL AFTER scheduled_end;
