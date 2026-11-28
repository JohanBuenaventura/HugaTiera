-- ============================================================================
-- Rollback 014: Revert ai_usage_log.feature ENUM to text & photo-analysis only
-- ============================================================================

DELETE FROM ai_usage_log
WHERE feature = 'image_generation';

ALTER TABLE ai_usage_log
  MODIFY COLUMN feature ENUM('requirements', 'photo_analysis', 'garden_plan') NOT NULL;
