-- Migration 004: Allow one person to hold multiple platform roles.
--
-- Run after Migration 003. Back up the target database before running.
-- users.role remains the currently selected dashboard mode; user_roles records
-- the roles the account is authorized to use.

CREATE TABLE user_roles (
  user_id INT UNSIGNED NOT NULL,
  role ENUM('client', 'gardener', 'administrator') NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, role),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_roles_role_user (role, user_id)
) ENGINE=InnoDB;

INSERT IGNORE INTO user_roles (user_id, role)
SELECT id, role FROM users
UNION
SELECT user_id, 'client' FROM client_profiles
UNION
SELECT user_id, 'gardener' FROM gardener_profiles;
