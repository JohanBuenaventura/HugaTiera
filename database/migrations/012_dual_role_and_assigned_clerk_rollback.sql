-- Rollback Migration 012: Remove clerk_gardener_assignments and dual-role columns

DROP TABLE IF EXISTS clerk_gardener_assignments;

UPDATE users SET role = 'client' WHERE role = 'clerk';

ALTER TABLE users
  DROP COLUMN can_act_as_gardener,
  DROP COLUMN can_act_as_client,
  MODIFY COLUMN role ENUM('client', 'gardener', 'administrator') NOT NULL;
