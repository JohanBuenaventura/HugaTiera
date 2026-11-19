USE hugatiera_db;

INSERT INTO service_categories (name, description, rate_per_sqm_min, rate_per_sqm_max, min_base_fee) VALUES
  ('Garden maintenance', 'Routine care, trimming, cleaning, and upkeep.', 50.00, 90.00, 400.00),
  ('Landscaping', 'Garden layout, planting, and outdoor space improvement.', 250.00, 500.00, 1500.00),
  ('Lawn care', 'Lawn preparation, mowing, edging, and maintenance.', 35.00, 65.00, 350.00),
  ('Tree and plant care', 'Pruning, planting, and general plant health support.', 80.00, 160.00, 500.00),
  ('Potted and terrace gardens', 'Small-space, balcony, and terrace garden services.', 100.00, 200.00, 500.00),
  ('Garden improvement', 'Practical improvements for existing gardens and outdoor areas.', 150.00, 300.00, 1000.00)
ON DUPLICATE KEY UPDATE
  description = VALUES(description),
  rate_per_sqm_min = VALUES(rate_per_sqm_min),
  rate_per_sqm_max = VALUES(rate_per_sqm_max),
  min_base_fee = VALUES(min_base_fee),
  is_active = TRUE;
