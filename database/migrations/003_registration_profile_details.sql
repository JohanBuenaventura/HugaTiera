-- Migration 003: Store middle name and date of birth for account registration.
--
-- Back up the target database before running this migration. The new columns
-- remain nullable so existing accounts continue to work until their profiles
-- are updated. The application requires these values for new registrations.

ALTER TABLE users
  ADD COLUMN middle_name VARCHAR(100) NULL AFTER first_name,
  ADD COLUMN date_of_birth DATE NULL AFTER last_name;
