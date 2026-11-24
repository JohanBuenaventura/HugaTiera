-- Rollback Migration 004: Remove price predictor and on-site inspection columns

ALTER TABLE quotation_revisions
  DROP COLUMN requires_site_visit;

ALTER TABLE quotations
  DROP COLUMN requires_site_visit;

ALTER TABLE inquiries
  DROP COLUMN price_comment,
  DROP COLUMN estimated_max_amount,
  DROP COLUMN estimated_min_amount,
  DROP COLUMN site_visit_requested,
  DROP COLUMN materials_option,
  DROP COLUMN work_complexity,
  DROP COLUMN area_sqm;

ALTER TABLE service_categories
  DROP COLUMN min_base_fee,
  DROP COLUMN rate_per_sqm_max,
  DROP COLUMN rate_per_sqm_min;
