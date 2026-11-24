-- Migration 011: Gardener daily crew size (workers available per day) and per-service workers required
-- Enables worker-level capacity tracking and "Fully Booked" day detection

ALTER TABLE gardener_profiles
  ADD COLUMN crew_size TINYINT UNSIGNED NOT NULL DEFAULT 1 AFTER max_concurrent_jobs;

UPDATE gardener_profiles
  SET crew_size = GREATEST(1, max_concurrent_jobs);

ALTER TABLE services
  ADD COLUMN workers_required TINYINT UNSIGNED NOT NULL DEFAULT 1 AFTER service_area;
