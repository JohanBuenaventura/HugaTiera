-- Migration 012: Dual Client/Gardener Role capability flags and Assigned Clerk role

ALTER TABLE users
  MODIFY COLUMN role ENUM('client', 'gardener', 'clerk', 'administrator') NOT NULL,
  ADD COLUMN can_act_as_client BOOLEAN NOT NULL DEFAULT FALSE AFTER role,
  ADD COLUMN can_act_as_gardener BOOLEAN NOT NULL DEFAULT FALSE AFTER can_act_as_client;

UPDATE users
  SET can_act_as_client = TRUE
  WHERE role = 'client';

UPDATE users
  SET can_act_as_gardener = TRUE
  WHERE role = 'gardener';

CREATE TABLE clerk_gardener_assignments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  clerk_id INT UNSIGNED NOT NULL,
  gardener_id INT UNSIGNED NOT NULL,
  assigned_by INT UNSIGNED NULL,
  notes VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_cga_clerk FOREIGN KEY (clerk_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_cga_gardener FOREIGN KEY (gardener_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_cga_assigned_by FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE KEY uq_clerk_gardener (clerk_id, gardener_id),
  INDEX idx_cga_gardener (gardener_id)
) ENGINE=InnoDB;
