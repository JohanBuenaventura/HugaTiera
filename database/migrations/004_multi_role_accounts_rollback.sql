-- Rollback Migration 004.
-- WARNING: This deletes all role memberships except the currently selected
-- users.role value. Back up the database before running.

DROP TABLE user_roles;
