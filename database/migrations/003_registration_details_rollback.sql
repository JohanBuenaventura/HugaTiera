-- Rollback Migration 003: This drops date_of_birth and permanently deletes its stored values.
-- Restore a pre-migration backup instead when the date-of-birth data must be retained.

ALTER TABLE users
  DROP COLUMN date_of_birth;
