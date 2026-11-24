-- Rollback Migration 006: Remove itemized pricing settings and labor/materials breakdown columns

ALTER TABLE quotation_revisions
  DROP COLUMN materials_breakdown,
  DROP COLUMN materials_amount,
  DROP COLUMN labor_amount;

ALTER TABLE quotations
  DROP COLUMN materials_breakdown,
  DROP COLUMN materials_amount,
  DROP COLUMN labor_amount;

ALTER TABLE inquiries
  DROP COLUMN estimated_materials_max,
  DROP COLUMN estimated_materials_min,
  DROP COLUMN estimated_labor_max,
  DROP COLUMN estimated_labor_min;

DROP TABLE IF EXISTS inquiry_estimate_items;
DROP TABLE IF EXISTS pricing_addons;
