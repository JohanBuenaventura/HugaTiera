-- Rollback Migration 003.
-- WARNING: This permanently deletes saved middle names and dates of birth.
-- Back up the database before running.

ALTER TABLE users
  DROP COLUMN date_of_birth,
  DROP COLUMN middle_name;
