-- ============================================================================
-- Migration 014: AI Garden Photo Concept Editing Usage Logging
-- Target: MySQL 8.x (XAMPP / InnoDB)
-- Extends ai_usage_log.feature ENUM to track 'image_generation' daily quotas
-- separately from hourly text/photo-analysis AI usage.
-- ============================================================================

ALTER TABLE ai_usage_log
  MODIFY COLUMN feature ENUM('requirements', 'photo_analysis', 'garden_plan', 'image_generation') NOT NULL;
