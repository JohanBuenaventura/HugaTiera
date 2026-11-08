USE hugatiera_db;

INSERT INTO service_categories (name, description) VALUES
  ('Garden maintenance', 'Routine care, trimming, cleaning, and upkeep.'),
  ('Landscaping', 'Garden layout, planting, and outdoor space improvement.'),
  ('Lawn care', 'Lawn preparation, mowing, edging, and maintenance.'),
  ('Tree and plant care', 'Pruning, planting, and general plant health support.'),
  ('Potted and terrace gardens', 'Small-space, balcony, and terrace garden services.'),
  ('Garden improvement', 'Practical improvements for existing gardens and outdoor areas.')
ON DUPLICATE KEY UPDATE description = VALUES(description), is_active = TRUE;
