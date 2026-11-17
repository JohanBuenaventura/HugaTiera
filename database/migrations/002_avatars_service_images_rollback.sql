-- Rollback Migration 002: Remove avatar_path from users and image_path from services

ALTER TABLE services
  DROP COLUMN image_path;

ALTER TABLE users
  DROP COLUMN avatar_path;
