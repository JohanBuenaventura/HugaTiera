DROP TABLE IF EXISTS garden_project_provider_matches;
ALTER TABLE ai_usage_log DROP FOREIGN KEY fk_ai_usage_project, DROP INDEX idx_ai_usage_project, DROP COLUMN project_id;
ALTER TABLE inquiries DROP FOREIGN KEY fk_inquiries_garden_project, DROP INDEX idx_inquiries_garden_project, DROP COLUMN garden_project_id;
ALTER TABLE request_images DROP FOREIGN KEY fk_request_images_project, DROP INDEX idx_request_images_project, DROP COLUMN project_id;
DROP TABLE IF EXISTS garden_projects;
