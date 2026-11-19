-- Migration 004: Add per-sq.m category baseline rates, inquiry price predictor fields,
-- client price comments, and on-site ocular inspection flags

ALTER TABLE service_categories
  ADD COLUMN rate_per_sqm_min DECIMAL(10, 2) NOT NULL DEFAULT 60.00 AFTER description,
  ADD COLUMN rate_per_sqm_max DECIMAL(10, 2) NOT NULL DEFAULT 120.00 AFTER rate_per_sqm_min,
  ADD COLUMN min_base_fee DECIMAL(10, 2) NOT NULL DEFAULT 450.00 AFTER rate_per_sqm_max;

UPDATE service_categories SET rate_per_sqm_min = 50.00,  rate_per_sqm_max = 90.00,  min_base_fee = 400.00  WHERE name = 'Garden maintenance';
UPDATE service_categories SET rate_per_sqm_min = 250.00, rate_per_sqm_max = 500.00, min_base_fee = 1500.00 WHERE name = 'Landscaping';
UPDATE service_categories SET rate_per_sqm_min = 35.00,  rate_per_sqm_max = 65.00,  min_base_fee = 350.00  WHERE name = 'Lawn care';
UPDATE service_categories SET rate_per_sqm_min = 80.00,  rate_per_sqm_max = 160.00, min_base_fee = 500.00  WHERE name = 'Tree and plant care';
UPDATE service_categories SET rate_per_sqm_min = 100.00, rate_per_sqm_max = 200.00, min_base_fee = 500.00  WHERE name = 'Potted and terrace gardens';
UPDATE service_categories SET rate_per_sqm_min = 150.00, rate_per_sqm_max = 300.00, min_base_fee = 1000.00 WHERE name = 'Garden improvement';

ALTER TABLE inquiries
  ADD COLUMN area_sqm DECIMAL(8, 2) NULL AFTER location,
  ADD COLUMN work_complexity ENUM('light', 'moderate', 'heavy') NULL AFTER area_sqm,
  ADD COLUMN materials_option ENUM('client_provides', 'gardener_provides') NULL AFTER work_complexity,
  ADD COLUMN site_visit_requested BOOLEAN NOT NULL DEFAULT FALSE AFTER materials_option,
  ADD COLUMN estimated_min_amount DECIMAL(10, 2) NULL AFTER site_visit_requested,
  ADD COLUMN estimated_max_amount DECIMAL(10, 2) NULL AFTER estimated_min_amount,
  ADD COLUMN price_comment TEXT NULL AFTER estimated_max_amount;

ALTER TABLE quotations
  ADD COLUMN requires_site_visit BOOLEAN NOT NULL DEFAULT FALSE AFTER proposed_changes;

ALTER TABLE quotation_revisions
  ADD COLUMN requires_site_visit BOOLEAN NOT NULL DEFAULT FALSE AFTER proposed_changes;
