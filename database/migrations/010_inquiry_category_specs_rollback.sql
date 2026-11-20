-- Rollback Migration 010: Remove category_specs column from inquiries

ALTER TABLE inquiries
  DROP COLUMN category_specs;
