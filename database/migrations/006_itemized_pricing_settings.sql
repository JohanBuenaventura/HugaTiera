-- Migration 006: Add configurable plant/material/equipment/disposal pricing catalog,
-- itemized inquiry estimate breakdown, and gardener quotation labor vs. materials split

CREATE TABLE pricing_addons (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL UNIQUE,
  item_type ENUM('plant', 'material', 'equipment', 'disposal') NOT NULL DEFAULT 'material',
  unit VARCHAR(40) NOT NULL DEFAULT 'per item',
  unit_price_min DECIMAL(10, 2) NOT NULL,
  unit_price_max DECIMAL(10, 2) NOT NULL,
  description VARCHAR(255) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_pricing_addons_range CHECK (unit_price_max >= unit_price_min),
  INDEX idx_pricing_addons_active_type (is_active, item_type)
) ENGINE=InnoDB;

INSERT INTO pricing_addons (name, item_type, unit, unit_price_min, unit_price_max, description) VALUES
  ('Ornamental / Potted Plants (Small-Medium)', 'plant', 'per plant', 80.00, 250.00, 'Common tropical ornamentals, indoor/outdoor potted greens.'),
  ('Shrubs / Hedges / Flowering Plants', 'plant', 'per plant', 150.00, 400.00, 'Bougainvillea, santan, gumamela, hedge plants, and medium shrubs.'),
  ('Carpet / Carabao Grass Turf', 'plant', 'per sq.m', 120.00, 250.00, 'Fresh sod/turf supply for lawn installation or patching.'),
  ('Garden Loam Soil / Compost', 'material', 'per bag', 70.00, 150.00, 'Sacked garden loam soil or organic compost mix.'),
  ('Organic Fertilizer / Plant Care Mix', 'material', 'per bag', 120.00, 250.00, 'Organic fertilizer, vermicast, or soil conditioner.'),
  ('Decorative Stones / Mulch / Edging', 'material', 'per sq.m', 150.00, 350.00, 'Pebbles, river stones, wood mulch, or pathway border materials.'),
  ('Green Waste Hauling & Debris Disposal', 'disposal', 'per load', 300.00, 700.00, 'Hauling and proper disposal of cut branches, weeds, and garden debris.'),
  ('Power Equipment Use (Brush Cutter / Chainsaw)', 'equipment', 'flat', 250.00, 600.00, 'Fuel and usage allowance for motorized brush cutters or chainsaws.')
ON DUPLICATE KEY UPDATE
  item_type = VALUES(item_type),
  unit = VALUES(unit),
  unit_price_min = VALUES(unit_price_min),
  unit_price_max = VALUES(unit_price_max),
  description = VALUES(description),
  is_active = TRUE;

CREATE TABLE inquiry_estimate_items (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  inquiry_id INT UNSIGNED NOT NULL,
  addon_id INT UNSIGNED NULL,
  item_name VARCHAR(120) NOT NULL,
  item_type ENUM('plant', 'material', 'equipment', 'disposal') NOT NULL DEFAULT 'material',
  unit VARCHAR(40) NOT NULL,
  quantity DECIMAL(8, 2) NOT NULL,
  unit_price_min DECIMAL(10, 2) NOT NULL,
  unit_price_max DECIMAL(10, 2) NOT NULL,
  subtotal_min DECIMAL(10, 2) NOT NULL,
  subtotal_max DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (inquiry_id) REFERENCES inquiries(id) ON DELETE CASCADE,
  FOREIGN KEY (addon_id) REFERENCES pricing_addons(id) ON DELETE SET NULL,
  INDEX idx_inquiry_estimate_items_inquiry (inquiry_id)
) ENGINE=InnoDB;

ALTER TABLE inquiries
  ADD COLUMN estimated_labor_min DECIMAL(10, 2) NULL AFTER site_visit_requested,
  ADD COLUMN estimated_labor_max DECIMAL(10, 2) NULL AFTER estimated_labor_min,
  ADD COLUMN estimated_materials_min DECIMAL(10, 2) NULL AFTER estimated_labor_max,
  ADD COLUMN estimated_materials_max DECIMAL(10, 2) NULL AFTER estimated_materials_min;

ALTER TABLE quotations
  ADD COLUMN labor_amount DECIMAL(10, 2) NULL AFTER amount,
  ADD COLUMN materials_amount DECIMAL(10, 2) NULL AFTER labor_amount,
  ADD COLUMN materials_breakdown TEXT NULL AFTER materials_amount;

ALTER TABLE quotation_revisions
  ADD COLUMN labor_amount DECIMAL(10, 2) NULL AFTER amount,
  ADD COLUMN materials_amount DECIMAL(10, 2) NULL AFTER labor_amount,
  ADD COLUMN materials_breakdown TEXT NULL AFTER materials_amount;
