-- Rollback Migration 011: Remove crew_size from gardener_profiles and workers_required from services

ALTER TABLE services
  DROP COLUMN workers_required;

ALTER TABLE gardener_profiles
  DROP COLUMN crew_size;
