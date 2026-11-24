-- Rollback Migration 005: Remove availability, capacity, unavailable dates, and estimated duration columns

ALTER TABLE agreements
  DROP COLUMN estimated_working_days;

ALTER TABLE quotation_revisions
  DROP COLUMN estimated_hours,
  DROP COLUMN estimated_working_days;

ALTER TABLE quotations
  DROP COLUMN estimated_hours,
  DROP COLUMN estimated_working_days;

DROP TABLE IF EXISTS gardener_unavailable_dates;

ALTER TABLE gardener_profiles
  DROP COLUMN availability_notes,
  DROP COLUMN max_concurrent_jobs,
  DROP COLUMN work_end_time,
  DROP COLUMN work_start_time,
  DROP COLUMN working_days;
