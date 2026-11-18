-- Migration 003: Add private date of birth for legal-age validation.
-- Optional middle_name is already present in the current databases.

ALTER TABLE users
  ADD COLUMN date_of_birth DATE NULL AFTER last_name;
