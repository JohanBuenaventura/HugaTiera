-- Rollback Migration 003: Remove middle_name and date_of_birth from users

ALTER TABLE users
  DROP COLUMN date_of_birth,
  DROP COLUMN middle_name;
