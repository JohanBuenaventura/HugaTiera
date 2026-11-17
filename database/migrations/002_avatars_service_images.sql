-- Migration 002: Add user profile picture (avatar_path) and service cover/design photo (image_path)

ALTER TABLE users
  ADD COLUMN avatar_path VARCHAR(255) NULL AFTER phone;

ALTER TABLE services
  ADD COLUMN image_path VARCHAR(255) NULL AFTER service_area;
