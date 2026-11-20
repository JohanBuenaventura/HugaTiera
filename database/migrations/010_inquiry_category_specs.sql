-- Migration 010: Store category-specific service request specifications (JSON)
-- e.g., landscaping style, hardscape materials, plants requested, lawn grass type, tree count/height, terrace pots

ALTER TABLE inquiries
  ADD COLUMN category_specs JSON NULL AFTER price_comment;
