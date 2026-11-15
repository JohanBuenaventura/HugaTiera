CREATE TABLE garden_projects (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  client_id INT UNSIGNED NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  preferred_style VARCHAR(100) NULL,
  budget_min DECIMAL(10, 2) NULL,
  budget_max DECIMAL(10, 2) NULL,
  garden_size VARCHAR(100) NULL,
  location VARCHAR(255) NULL,
  status ENUM('draft', 'generating', 'ready', 'failed', 'archived') NOT NULL DEFAULT 'draft',
  analysis_json JSON NULL,
  generation_error VARCHAR(255) NULL,
  ai_disclaimer TEXT NULL,
  generated_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_garden_projects_client_status (client_id, status, updated_at)
) ENGINE=InnoDB;

ALTER TABLE request_images
  ADD COLUMN project_id INT UNSIGNED NULL AFTER inquiry_id,
  ADD CONSTRAINT fk_request_images_project FOREIGN KEY (project_id) REFERENCES garden_projects(id) ON DELETE CASCADE,
  ADD INDEX idx_request_images_project (project_id, kind);

ALTER TABLE inquiries
  ADD COLUMN garden_project_id INT UNSIGNED NULL AFTER client_id,
  ADD CONSTRAINT fk_inquiries_garden_project FOREIGN KEY (garden_project_id) REFERENCES garden_projects(id) ON DELETE SET NULL,
  ADD INDEX idx_inquiries_garden_project (garden_project_id);

ALTER TABLE ai_usage_log
  MODIFY feature ENUM('requirements', 'photo_analysis', 'garden_plan', 'image_generation') NOT NULL,
  ADD COLUMN project_id INT UNSIGNED NULL AFTER inquiry_id,
  ADD CONSTRAINT fk_ai_usage_project FOREIGN KEY (project_id) REFERENCES garden_projects(id) ON DELETE SET NULL,
  ADD INDEX idx_ai_usage_project (project_id, created_at);

CREATE TABLE garden_project_provider_matches (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id INT UNSIGNED NOT NULL,
  gardener_id INT UNSIGNED NOT NULL,
  suitability ENUM('highly_suitable', 'partially_suitable', 'requires_consultation') NOT NULL,
  match_score DECIMAL(5, 2) NULL,
  rationale TEXT NOT NULL,
  matched_services JSON NULL,
  service_area_match TINYINT UNSIGNED NOT NULL DEFAULT 0,
  rating_snapshot DECIMAL(3, 2) NULL,
  generated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES garden_projects(id) ON DELETE CASCADE,
  FOREIGN KEY (gardener_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_garden_project_provider (project_id, gardener_id)
) ENGINE=InnoDB;
