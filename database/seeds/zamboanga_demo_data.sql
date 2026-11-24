-- ============================================================================
-- HugaTiera — Zamboanga City Dummy Seed Data (Testing & Demo Only)
-- ============================================================================
-- Safe & Idempotent: Uses INSERT IGNORE / lookups by unique keys so it can be
-- imported without wiping existing records or failing on re-runs.
-- Demo password for all seeded accounts: DemoPass123!
-- Requires schema at Migration 013 (25 tables / 59 foreign keys).
-- ============================================================================

-- Ensure all 6 core service categories exist with per-sq.m baseline rates
INSERT INTO service_categories (name, description, rate_per_sqm_min, rate_per_sqm_max, min_base_fee) VALUES
  ('Garden maintenance', 'Routine care, trimming, cleaning, and upkeep.', 50.00, 90.00, 400.00),
  ('Landscaping', 'Garden layout, planting, and outdoor space improvement.', 250.00, 500.00, 1500.00),
  ('Lawn care', 'Lawn preparation, mowing, edging, and maintenance.', 35.00, 65.00, 350.00),
  ('Tree and plant care', 'Pruning, planting, and general plant health support.', 80.00, 160.00, 500.00),
  ('Potted and terrace gardens', 'Small-space, balcony, and terrace garden services.', 100.00, 200.00, 500.00),
  ('Garden improvement', 'Practical improvements for existing gardens and outdoor areas.', 150.00, 300.00, 1000.00)
ON DUPLICATE KEY UPDATE
  is_active = TRUE;

SET @cat_maint   = (SELECT id FROM service_categories WHERE name = 'Garden maintenance' LIMIT 1);
SET @cat_land    = (SELECT id FROM service_categories WHERE name = 'Landscaping' LIMIT 1);
SET @cat_lawn    = (SELECT id FROM service_categories WHERE name = 'Lawn care' LIMIT 1);
SET @cat_tree    = (SELECT id FROM service_categories WHERE name = 'Tree and plant care' LIMIT 1);
SET @cat_terrace = (SELECT id FROM service_categories WHERE name = 'Potted and terrace gardens' LIMIT 1);
SET @cat_improve = (SELECT id FROM service_categories WHERE name = 'Garden improvement' LIMIT 1);

-- Bcrypt hash for: DemoPass123!
SET @demo_hash = '$2b$10$0KzA745S9zbRyZqkRFzad.dkgsQsZWhoedqmiVEBFFj7SpBP3vZKO';

-- ----------------------------------------------------------------------------
-- 1. Seed 2 Demo Clients in Zamboanga City
-- ----------------------------------------------------------------------------
INSERT IGNORE INTO users
  (email, password_hash, role, can_act_as_client, can_act_as_gardener, first_name, middle_name, last_name, phone, date_of_birth, is_active)
VALUES
  ('clarissa.client.demo@hugatiera.test', @demo_hash, 'client', TRUE, FALSE, 'Clarissa', 'Bautista', 'Mendoza', '09175550101', '1993-04-18', TRUE),
  ('rafael.client.demo@hugatiera.test',   @demo_hash, 'client', TRUE, FALSE, 'Rafael',   'Diaz',     'Enriquez', '09175550102', '1989-09-22', TRUE);

SET @client_1 = (SELECT id FROM users WHERE email = 'clarissa.client.demo@hugatiera.test' LIMIT 1);
SET @client_2 = (SELECT id FROM users WHERE email = 'rafael.client.demo@hugatiera.test' LIMIT 1);

INSERT IGNORE INTO client_profiles (user_id, address, city, bio) VALUES
  (@client_1, 'Don Alfaro St., Brgy. Tetuan', 'Zamboanga City', 'Homeowner maintaining a tropical front lawn and backyard garden.'),
  (@client_2, 'Gov. Ramos Ave., Brgy. Sta. Maria', 'Zamboanga City', 'Looking for balcony orchid care and weekend garden improvement.');

-- ----------------------------------------------------------------------------
-- 2. Seed 6 Approved Zamboanga City Gardeners (Option 3: Client + Gardener)
-- ----------------------------------------------------------------------------
INSERT IGNORE INTO users
  (email, password_hash, role, can_act_as_client, can_act_as_gardener, first_name, middle_name, last_name, phone, date_of_birth, is_active)
VALUES
  ('canelar.landscape.demo@hugatiera.test',   @demo_hash, 'gardener', TRUE, TRUE, 'Eduardo', 'Santos',    'Ramos',      '09175550201', '1986-03-11', TRUE),
  ('pasonanca.trees.demo@hugatiera.test',     @demo_hash, 'gardener', TRUE, TRUE, 'Danilo',  'Flores',    'Alvarez',    '09175550202', '1983-07-25', TRUE),
  ('tetuan.lawn.demo@hugatiera.test',         @demo_hash, 'gardener', TRUE, TRUE, 'Marlon',  NULL,        'Del Rosario','09175550203', '1991-11-04', TRUE),
  ('stamaria.terrace.demo@hugatiera.test',    @demo_hash, 'gardener', TRUE, TRUE, 'Teresita','Ocampo',    'Lim',        '09175550204', '1990-02-14', TRUE),
  ('guiwan.improvement.demo@hugatiera.test',  @demo_hash, 'gardener', TRUE, TRUE, 'Arnel',   'Castro',    'Fernandez',  '09175550205', '1987-08-30', TRUE),
  ('putik.maintenance.demo@hugatiera.test',   @demo_hash, 'gardener', TRUE, TRUE, 'Jayson',  NULL,        'Morales',    '09175550206', '1994-06-19', TRUE);

SET @g_canelar   = (SELECT id FROM users WHERE email = 'canelar.landscape.demo@hugatiera.test' LIMIT 1);
SET @g_pasonanca = (SELECT id FROM users WHERE email = 'pasonanca.trees.demo@hugatiera.test' LIMIT 1);
SET @g_tetuan    = (SELECT id FROM users WHERE email = 'tetuan.lawn.demo@hugatiera.test' LIMIT 1);
SET @g_stamaria  = (SELECT id FROM users WHERE email = 'stamaria.terrace.demo@hugatiera.test' LIMIT 1);
SET @g_guiwan    = (SELECT id FROM users WHERE email = 'guiwan.improvement.demo@hugatiera.test' LIMIT 1);
SET @g_putik     = (SELECT id FROM users WHERE email = 'putik.maintenance.demo@hugatiera.test' LIMIT 1);

INSERT IGNORE INTO client_profiles (user_id, address, city) VALUES
  (@g_canelar,   'Brgy. Canelar Moret', 'Zamboanga City'),
  (@g_pasonanca, 'Brgy. Pasonanca',     'Zamboanga City'),
  (@g_tetuan,    'Brgy. Tetuan',        'Zamboanga City'),
  (@g_stamaria,  'Brgy. Sta. Maria',    'Zamboanga City'),
  (@g_guiwan,    'Brgy. Guiwan',        'Zamboanga City'),
  (@g_putik,     'Brgy. Putik',         'Zamboanga City');

INSERT INTO gardener_profiles
  (user_id, business_name, description, service_area, years_of_experience, working_days, work_start_time, work_end_time, max_concurrent_jobs, crew_size, availability_notes, is_approved)
VALUES
  (@g_canelar,   'Canelar Moret Landscape & Garden Works', 'Residential tropical landscape installation, pathway borders, pebble work, and full yard redesigns around Canelar, San Jose Gusu, and City Proper.', 'Canelar Moret, Zamboanga City', 8, 'mon,tue,wed,thu,fri,sat', '08:00:00', '17:00:00', 2, 4, 'Ocular visit available Mon-Sat mornings.', TRUE),
  (@g_pasonanca, 'Pasonanca Tropical Tree & Plant Care',   'Safe canopy pruning, fruit tree care, palm trimming, and organic plant health maintenance serving Pasonanca, Cabatangan, and Sta. Maria.', 'Pasonanca, Zamboanga City', 10, 'mon,tue,wed,thu,fri,sat', '07:30:00', '16:30:00', 2, 3, 'Equipped with pole pruners and green-waste hauling.', TRUE),
  (@g_tetuan,    'Tetuan Lawn & Turf Specialists',         'Precision lawn mowing, Bermuda and Carabao grass installation, edging, and post-rain cleanup across Tetuan, Gov. Camins, and Tugbungan.', 'Tetuan, Zamboanga City', 6, 'mon,tue,wed,thu,fri,sat,sun', '07:00:00', '17:00:00', 2, 3, 'Weekend bookings open.', TRUE),
  (@g_stamaria,  'Sta. Maria Orchid & Terrace Gardens',    'Balcony makeovers, orchid and ornamental plant styling, vertical pocket planters, and compact urban gardens for Sta. Maria and Tumaga homes.', 'Sta. Maria, Zamboanga City', 5, 'tue,wed,thu,fri,sat,sun', '08:30:00', '17:30:00', 2, 2, 'Custom potted plant sourcing available.', TRUE),
  (@g_guiwan,    'Guiwan Backyard & Hardscape Solutions',  'Raised garden beds, drainage grading, loam soil enrichment, stone edging, and practical backyard upgrades in Guiwan, Putik, and Divisoria.', 'Guiwan, Zamboanga City', 7, 'mon,tue,wed,thu,fri,sat', '08:00:00', '17:00:00', 2, 4, 'Full crew available for multi-day backyard upgrades.', TRUE),
  (@g_putik,     'Putik & Tumaga Eco-Garden Maintenance',  'Reliable bi-weekly yard maintenance, hedge shaping, weeding, composting, and general garden upkeep in Putik, Tumaga, and Divisoria.', 'Putik, Zamboanga City', 4, 'mon,tue,wed,thu,fri,sat', '08:00:00', '16:30:00', 2, 2, 'Ideal for recurring residential maintenance.', TRUE)
ON DUPLICATE KEY UPDATE
  is_approved = TRUE,
  crew_size = VALUES(crew_size);

-- ----------------------------------------------------------------------------
-- 3. Seed 12 Services Across All 6 Categories (2 per Category)
-- ----------------------------------------------------------------------------
INSERT INTO services (gardener_id, category_id, title, description, indicative_price, price_unit, service_area, workers_required, is_active)
SELECT @g_canelar, @cat_land, 'Tropical Backyard Landscaping & Planting',
       'Complete residential landscape layout with ornamental hedges, tropical palms, stepping stones, and enriched loam soil preparation.',
       380.00, 'per sq.m', 'Canelar Moret, Zamboanga City', 3, TRUE
WHERE NOT EXISTS (SELECT 1 FROM services WHERE gardener_id = @g_canelar AND title = 'Tropical Backyard Landscaping & Planting');

INSERT INTO services (gardener_id, category_id, title, description, indicative_price, price_unit, service_area, workers_required, is_active)
SELECT @g_guiwan, @cat_land, 'Front Yard Pathway & Ornamental Redesign',
       'Curved stone pathway installation paired with drought-tolerant Zamboanga ornamentals, river pebbles, and bordered turf.',
       320.00, 'per sq.m', 'Guiwan, Zamboanga City', 3, TRUE
WHERE NOT EXISTS (SELECT 1 FROM services WHERE gardener_id = @g_guiwan AND title = 'Front Yard Pathway & Ornamental Redesign');

INSERT INTO services (gardener_id, category_id, title, description, indicative_price, price_unit, service_area, workers_required, is_active)
SELECT @g_tetuan, @cat_lawn, 'Bermuda & Carabao Lawn Mowing & Edging',
       'Clean grass cutting, walkway border trimming, weed clearing, and swept green-waste bagging for residential yards.',
       45.00, 'per sq.m', 'Tetuan, Zamboanga City', 2, TRUE
WHERE NOT EXISTS (SELECT 1 FROM services WHERE gardener_id = @g_tetuan AND title = 'Bermuda & Carabao Lawn Mowing & Edging');

INSERT INTO services (gardener_id, category_id, title, description, indicative_price, price_unit, service_area, workers_required, is_active)
SELECT @g_putik, @cat_lawn, 'Residential Grass Patching & De-Weeding',
       'Manual broadleaf weed removal, soil aeration, and fresh turf patching for bare lawn sections.',
       550.00, 'per visit', 'Putik, Zamboanga City', 1, TRUE
WHERE NOT EXISTS (SELECT 1 FROM services WHERE gardener_id = @g_putik AND title = 'Residential Grass Patching & De-Weeding');

INSERT INTO services (gardener_id, category_id, title, description, indicative_price, price_unit, service_area, workers_required, is_active)
SELECT @g_putik, @cat_maint, 'Bi-Weekly Garden Upkeep & Hedge Shaping',
       'Scheduled shrub pruning, bed weeding, organic fertilizing, leaf sweeping, and general tidying for residential gardens.',
       65.00, 'per sq.m', 'Putik, Zamboanga City', 2, TRUE
WHERE NOT EXISTS (SELECT 1 FROM services WHERE gardener_id = @g_putik AND title = 'Bi-Weekly Garden Upkeep & Hedge Shaping');

INSERT INTO services (gardener_id, category_id, title, description, indicative_price, price_unit, service_area, workers_required, is_active)
SELECT @g_tetuan, @cat_maint, 'Post-Rain Yard Cleanup & Mulching',
       'Clearing fallen branches, overgrown weeds, and storm debris followed by fresh compost mulching around garden beds.',
       900.00, 'per visit', 'Tetuan, Zamboanga City', 2, TRUE
WHERE NOT EXISTS (SELECT 1 FROM services WHERE gardener_id = @g_tetuan AND title = 'Post-Rain Yard Cleanup & Mulching');

INSERT INTO services (gardener_id, category_id, title, description, indicative_price, price_unit, service_area, workers_required, is_active)
SELECT @g_pasonanca, @cat_tree, 'Tropical Tree Pruning & Canopy Trimming',
       'Controlled branch reduction for mango, palm, and shade trees near rooflines and fences, including neat branch cutting.',
       1200.00, 'per tree', 'Pasonanca, Zamboanga City', 2, TRUE
WHERE NOT EXISTS (SELECT 1 FROM services WHERE gardener_id = @g_pasonanca AND title = 'Tropical Tree Pruning & Canopy Trimming');

INSERT INTO services (gardener_id, category_id, title, description, indicative_price, price_unit, service_area, workers_required, is_active)
SELECT @g_pasonanca, @cat_tree, 'Fruit Tree & Ornamental Plant Health Care',
       'Organic neem pest control, vermicast root feeding, soil conditioning, and seasonal pruning for healthier blooms and fruiting.',
       110.00, 'per sq.m', 'Pasonanca, Zamboanga City', 1, TRUE
WHERE NOT EXISTS (SELECT 1 FROM services WHERE gardener_id = @g_pasonanca AND title = 'Fruit Tree & Ornamental Plant Health Care');

INSERT INTO services (gardener_id, category_id, title, description, indicative_price, price_unit, service_area, workers_required, is_active)
SELECT @g_stamaria, @cat_terrace, 'Balcony & Terrace Orchid Garden Styling',
       'Space-saving hanging racks, terracotta and ceramic potting, orchid mounting, and sunlight-matched plant arrangement.',
       160.00, 'per sq.m', 'Sta. Maria, Zamboanga City', 1, TRUE
WHERE NOT EXISTS (SELECT 1 FROM services WHERE gardener_id = @g_stamaria AND title = 'Balcony & Terrace Orchid Garden Styling');

INSERT INTO services (gardener_id, category_id, title, description, indicative_price, price_unit, service_area, workers_required, is_active)
SELECT @g_stamaria, @cat_terrace, 'Patio Potted Plant Refresh & Repotting',
       'Fresh loam/cocopeat soil replacement, root trimming, pot upgrades, and pest check for up to 15 home potted plants.',
       1500.00, 'per setup', 'Sta. Maria, Zamboanga City', 1, TRUE
WHERE NOT EXISTS (SELECT 1 FROM services WHERE gardener_id = @g_stamaria AND title = 'Patio Potted Plant Refresh & Repotting');

INSERT INTO services (gardener_id, category_id, title, description, indicative_price, price_unit, service_area, workers_required, is_active)
SELECT @g_guiwan, @cat_improve, 'Raised Garden Bed & Loam Soil Installation',
       'Custom timber or concrete-block raised beds filled with screened loam soil and organic compost for herbs or ornamentals.',
       210.00, 'per sq.m', 'Guiwan, Zamboanga City', 2, TRUE
WHERE NOT EXISTS (SELECT 1 FROM services WHERE gardener_id = @g_guiwan AND title = 'Raised Garden Bed & Loam Soil Installation');

INSERT INTO services (gardener_id, category_id, title, description, indicative_price, price_unit, service_area, workers_required, is_active)
SELECT @g_canelar, @cat_improve, 'Backyard Drainage, Pebbles & Border Upgrade',
       'Gravel drainage channels, landscape fabric, decorative white/river pebbles, and concrete edging to fix muddy garden spots.',
       240.00, 'per sq.m', 'Canelar Moret, Zamboanga City', 3, TRUE
WHERE NOT EXISTS (SELECT 1 FROM services WHERE gardener_id = @g_canelar AND title = 'Backyard Drainage, Pebbles & Border Upgrade');

-- Lookup service IDs for seeded reviews/bookings
SET @svc_canelar   = (SELECT id FROM services WHERE gardener_id = @g_canelar   AND title = 'Tropical Backyard Landscaping & Planting' LIMIT 1);
SET @svc_pasonanca = (SELECT id FROM services WHERE gardener_id = @g_pasonanca AND title = 'Tropical Tree Pruning & Canopy Trimming' LIMIT 1);
SET @svc_tetuan    = (SELECT id FROM services WHERE gardener_id = @g_tetuan    AND title = 'Bermuda & Carabao Lawn Mowing & Edging' LIMIT 1);
SET @svc_stamaria  = (SELECT id FROM services WHERE gardener_id = @g_stamaria  AND title = 'Balcony & Terrace Orchid Garden Styling' LIMIT 1);
SET @svc_guiwan    = (SELECT id FROM services WHERE gardener_id = @g_guiwan    AND title = 'Raised Garden Bed & Loam Soil Installation' LIMIT 1);
SET @svc_putik     = (SELECT id FROM services WHERE gardener_id = @g_putik     AND title = 'Bi-Weekly Garden Upkeep & Hedge Shaping' LIMIT 1);

-- ----------------------------------------------------------------------------
-- 4. Seed Completed & Closed Bookings + Verified 4-5 Star Reviews
--    (Powers AI Smart Match ratings, conduct scores, and recent reviews showcase)
-- ----------------------------------------------------------------------------
INSERT INTO inquiries (request_type, client_id, gardener_id, service_id, category_id, subject, description, location, area_sqm, work_complexity, materials_option, estimated_min_amount, estimated_max_amount, status)
SELECT 'direct', @client_1, @g_tetuan, @svc_tetuan, @cat_lawn, '[ZC Demo] Front Lawn Trim - Tetuan', 'Trim 45 sq.m front Bermuda grass lawn and clean edges.', 'Brgy. Tetuan, Zamboanga City', 45.00, 'moderate', 'client_provides', 1600.00, 2600.00, 'confirmed'
WHERE NOT EXISTS (SELECT 1 FROM inquiries WHERE subject = '[ZC Demo] Front Lawn Trim - Tetuan');

INSERT INTO inquiries (request_type, client_id, gardener_id, service_id, category_id, subject, description, location, area_sqm, work_complexity, materials_option, estimated_min_amount, estimated_max_amount, status)
SELECT 'direct', @client_2, @g_stamaria, @svc_stamaria, @cat_terrace, '[ZC Demo] Balcony Orchid Refresh - Sta. Maria', 'Arrange potted orchids and hanging ferns along our 14 sq.m terrace.', 'Brgy. Sta. Maria, Zamboanga City', 14.00, 'light', 'gardener_provides', 1800.00, 3200.00, 'confirmed'
WHERE NOT EXISTS (SELECT 1 FROM inquiries WHERE subject = '[ZC Demo] Balcony Orchid Refresh - Sta. Maria');

INSERT INTO inquiries (request_type, client_id, gardener_id, service_id, category_id, subject, description, location, area_sqm, work_complexity, materials_option, estimated_min_amount, estimated_max_amount, status)
SELECT 'direct', @client_1, @g_canelar, @svc_canelar, @cat_land, '[ZC Demo] Backyard Tropical Corner - Tetuan', 'Install ornamental borders, river pebbles, and palms for 30 sq.m backyard.', 'Brgy. Tetuan, Zamboanga City', 30.00, 'heavy', 'gardener_provides', 8500.00, 14000.00, 'confirmed'
WHERE NOT EXISTS (SELECT 1 FROM inquiries WHERE subject = '[ZC Demo] Backyard Tropical Corner - Tetuan');

INSERT INTO inquiries (request_type, client_id, gardener_id, service_id, category_id, subject, description, location, area_sqm, work_complexity, materials_option, estimated_min_amount, estimated_max_amount, status)
SELECT 'direct', @client_2, @g_pasonanca, @svc_pasonanca, @cat_tree, '[ZC Demo] Mango Tree Canopy Pruning - Sta. Maria', 'Prune overhanging mango tree branches safely away from roof gutter.', 'Brgy. Sta. Maria, Zamboanga City', 20.00, 'moderate', 'client_provides', 1800.00, 3000.00, 'confirmed'
WHERE NOT EXISTS (SELECT 1 FROM inquiries WHERE subject = '[ZC Demo] Mango Tree Canopy Pruning - Sta. Maria');

INSERT INTO inquiries (request_type, client_id, gardener_id, service_id, category_id, subject, description, location, area_sqm, work_complexity, materials_option, estimated_min_amount, estimated_max_amount, status)
SELECT 'direct', @client_1, @g_guiwan, @svc_guiwan, @cat_improve, '[ZC Demo] Herb Raised Beds - Tetuan', 'Build two raised herb garden beds with fresh loam soil.', 'Brgy. Tetuan, Zamboanga City', 18.00, 'moderate', 'gardener_provides', 3200.00, 5200.00, 'confirmed'
WHERE NOT EXISTS (SELECT 1 FROM inquiries WHERE subject = '[ZC Demo] Herb Raised Beds - Tetuan');

INSERT INTO inquiries (request_type, client_id, gardener_id, service_id, category_id, subject, description, location, area_sqm, work_complexity, materials_option, estimated_min_amount, estimated_max_amount, status)
SELECT 'direct', @client_2, @g_putik, @svc_putik, @cat_maint, '[ZC Demo] Monthly Garden Cleanup - Sta. Maria', 'Shrub shaping, weeding, and organic fertilizer application.', 'Brgy. Sta. Maria, Zamboanga City', 35.00, 'light', 'client_provides', 1800.00, 2900.00, 'confirmed'
WHERE NOT EXISTS (SELECT 1 FROM inquiries WHERE subject = '[ZC Demo] Monthly Garden Cleanup - Sta. Maria');

SET @inq_1 = (SELECT id FROM inquiries WHERE subject = '[ZC Demo] Front Lawn Trim - Tetuan' LIMIT 1);
SET @inq_2 = (SELECT id FROM inquiries WHERE subject = '[ZC Demo] Balcony Orchid Refresh - Sta. Maria' LIMIT 1);
SET @inq_3 = (SELECT id FROM inquiries WHERE subject = '[ZC Demo] Backyard Tropical Corner - Tetuan' LIMIT 1);
SET @inq_4 = (SELECT id FROM inquiries WHERE subject = '[ZC Demo] Mango Tree Canopy Pruning - Sta. Maria' LIMIT 1);
SET @inq_5 = (SELECT id FROM inquiries WHERE subject = '[ZC Demo] Herb Raised Beds - Tetuan' LIMIT 1);
SET @inq_6 = (SELECT id FROM inquiries WHERE subject = '[ZC Demo] Monthly Garden Cleanup - Sta. Maria' LIMIT 1);

-- Agreed mutual agreements for each completed demo job
INSERT INTO agreements (inquiry_id, client_id, gardener_id, version, scope_of_work, amount, required_deposit_amount, price_basis, scheduled_start, scheduled_end, estimated_working_days, location, proposed_by, client_approved_at, gardener_approved_at, status)
SELECT @inq_1, @client_1, @g_tetuan, 1, 'Lawn mowing, border edging, and debris bagging for 45 sq.m.', 2000.00, 600.00, 'Fixed total', '2026-11-05 08:00:00', '2026-11-05 12:00:00', 0.5, 'Don Alfaro St., Brgy. Tetuan, Zamboanga City', @g_tetuan, '2026-11-03 10:00:00', '2026-11-03 09:00:00', 'agreed'
WHERE NOT EXISTS (SELECT 1 FROM agreements WHERE inquiry_id = @inq_1);

INSERT INTO agreements (inquiry_id, client_id, gardener_id, version, scope_of_work, amount, required_deposit_amount, price_basis, scheduled_start, scheduled_end, estimated_working_days, location, proposed_by, client_approved_at, gardener_approved_at, status)
SELECT @inq_2, @client_2, @g_stamaria, 1, 'Terrace orchid repotting, vertical planter mount, and decorative pebble dressing.', 2600.00, 780.00, 'Fixed total', '2026-11-07 09:00:00', '2026-11-07 14:00:00', 0.5, 'Gov. Ramos Ave., Brgy. Sta. Maria, Zamboanga City', @g_stamaria, '2026-11-05 14:00:00', '2026-11-05 12:00:00', 'agreed'
WHERE NOT EXISTS (SELECT 1 FROM agreements WHERE inquiry_id = @inq_2);

INSERT INTO agreements (inquiry_id, client_id, gardener_id, version, scope_of_work, amount, required_deposit_amount, price_basis, scheduled_start, scheduled_end, estimated_working_days, location, proposed_by, client_approved_at, gardener_approved_at, status)
SELECT @inq_3, @client_1, @g_canelar, 1, 'Tropical backyard landscaping with palms, santan hedges, and pebble border.', 11500.00, 3450.00, 'Labor + materials', '2026-11-09 08:00:00', '2026-11-10 16:00:00', 2.0, 'Don Alfaro St., Brgy. Tetuan, Zamboanga City', @g_canelar, '2026-11-06 16:00:00', '2026-11-06 15:00:00', 'agreed'
WHERE NOT EXISTS (SELECT 1 FROM agreements WHERE inquiry_id = @inq_3);

INSERT INTO agreements (inquiry_id, client_id, gardener_id, version, scope_of_work, amount, required_deposit_amount, price_basis, scheduled_start, scheduled_end, estimated_working_days, location, proposed_by, client_approved_at, gardener_approved_at, status)
SELECT @inq_4, @client_2, @g_pasonanca, 1, 'Safe canopy pruning of mature mango tree and hauling of trimmed branches.', 2400.00, 720.00, 'Fixed total', '2026-11-11 08:00:00', '2026-11-11 13:00:00', 0.5, 'Gov. Ramos Ave., Brgy. Sta. Maria, Zamboanga City', @g_pasonanca, '2026-11-09 11:00:00', '2026-11-09 10:00:00', 'agreed'
WHERE NOT EXISTS (SELECT 1 FROM agreements WHERE inquiry_id = @inq_4);

INSERT INTO agreements (inquiry_id, client_id, gardener_id, version, scope_of_work, amount, required_deposit_amount, price_basis, scheduled_start, scheduled_end, estimated_working_days, location, proposed_by, client_approved_at, gardener_approved_at, status)
SELECT @inq_5, @client_1, @g_guiwan, 1, 'Two raised garden beds with treated borders, screened loam soil, and compost.', 4200.00, 1260.00, 'Labor + materials', '2026-11-13 08:00:00', '2026-11-13 16:30:00', 1.0, 'Don Alfaro St., Brgy. Tetuan, Zamboanga City', @g_guiwan, '2026-11-11 09:30:00', '2026-11-11 09:00:00', 'agreed'
WHERE NOT EXISTS (SELECT 1 FROM agreements WHERE inquiry_id = @inq_5);

INSERT INTO agreements (inquiry_id, client_id, gardener_id, version, scope_of_work, amount, required_deposit_amount, price_basis, scheduled_start, scheduled_end, estimated_working_days, location, proposed_by, client_approved_at, gardener_approved_at, status)
SELECT @inq_6, @client_2, @g_putik, 1, 'Full garden weeding, hedge shaping, and organic vermicast feeding.', 2200.00, 660.00, 'Fixed total', '2026-11-15 08:00:00', '2026-11-15 12:30:00', 0.5, 'Gov. Ramos Ave., Brgy. Sta. Maria, Zamboanga City', @g_putik, '2026-11-13 15:00:00', '2026-11-13 14:00:00', 'agreed'
WHERE NOT EXISTS (SELECT 1 FROM agreements WHERE inquiry_id = @inq_6);

SET @agr_1 = (SELECT id FROM agreements WHERE inquiry_id = @inq_1 LIMIT 1);
SET @agr_2 = (SELECT id FROM agreements WHERE inquiry_id = @inq_2 LIMIT 1);
SET @agr_3 = (SELECT id FROM agreements WHERE inquiry_id = @inq_3 LIMIT 1);
SET @agr_4 = (SELECT id FROM agreements WHERE inquiry_id = @inq_4 LIMIT 1);
SET @agr_5 = (SELECT id FROM agreements WHERE inquiry_id = @inq_5 LIMIT 1);
SET @agr_6 = (SELECT id FROM agreements WHERE inquiry_id = @inq_6 LIMIT 1);

-- Completed, fully paid, mutually closed bookings
INSERT IGNORE INTO bookings (inquiry_id, agreement_id, client_id, gardener_id, service_id, scheduled_start, scheduled_end, location, status, booking_stage, payment_status, required_deposit_amount, amount_paid, paid_at, transaction_status, client_completion_confirmed_at, gardener_completion_confirmed_at, transaction_closed_at) VALUES
  (@inq_1, @agr_1, @client_1, @g_tetuan,    @svc_tetuan,    '2026-11-05 08:00:00', '2026-11-05 12:00:00', 'Don Alfaro St., Brgy. Tetuan, Zamboanga City',      'completed', 'booked', 'fully_paid', 600.00,  2000.00,  '2026-11-05 12:15:00', 'closed', '2026-11-05 12:30:00', '2026-11-05 12:20:00', '2026-11-05 12:30:00'),
  (@inq_2, @agr_2, @client_2, @g_stamaria,  @svc_stamaria,  '2026-11-07 09:00:00', '2026-11-07 14:00:00', 'Gov. Ramos Ave., Brgy. Sta. Maria, Zamboanga City', 'completed', 'booked', 'fully_paid', 780.00,  2600.00,  '2026-11-07 14:10:00', 'closed', '2026-11-07 14:30:00', '2026-11-07 14:15:00', '2026-11-07 14:30:00'),
  (@inq_3, @agr_3, @client_1, @g_canelar,   @svc_canelar,   '2026-11-09 08:00:00', '2026-11-10 16:00:00', 'Don Alfaro St., Brgy. Tetuan, Zamboanga City',      'completed', 'booked', 'fully_paid', 3450.00, 11500.00, '2026-11-10 16:15:00', 'closed', '2026-11-10 16:45:00', '2026-11-10 16:30:00', '2026-11-10 16:45:00'),
  (@inq_4, @agr_4, @client_2, @g_pasonanca, @svc_pasonanca, '2026-11-11 08:00:00', '2026-11-11 13:00:00', 'Gov. Ramos Ave., Brgy. Sta. Maria, Zamboanga City', 'completed', 'booked', 'fully_paid', 720.00,  2400.00,  '2026-11-11 13:10:00', 'closed', '2026-11-11 13:30:00', '2026-11-11 13:20:00', '2026-11-11 13:30:00'),
  (@inq_5, @agr_5, @client_1, @g_guiwan,    @svc_guiwan,    '2026-11-13 08:00:00', '2026-11-13 16:30:00', 'Don Alfaro St., Brgy. Tetuan, Zamboanga City',      'completed', 'booked', 'fully_paid', 1260.00, 4200.00,  '2026-11-13 16:45:00', 'closed', '2026-11-13 17:00:00', '2026-11-13 16:50:00', '2026-11-13 17:00:00'),
  (@inq_6, @agr_6, @client_2, @g_putik,     @svc_putik,     '2026-11-15 08:00:00', '2026-11-15 12:30:00', 'Gov. Ramos Ave., Brgy. Sta. Maria, Zamboanga City', 'completed', 'booked', 'fully_paid', 660.00,  2200.00,  '2026-11-15 12:40:00', 'closed', '2026-11-15 13:00:00', '2026-11-15 12:50:00', '2026-11-15 13:00:00');

SET @bkg_1 = (SELECT id FROM bookings WHERE agreement_id = @agr_1 LIMIT 1);
SET @bkg_2 = (SELECT id FROM bookings WHERE agreement_id = @agr_2 LIMIT 1);
SET @bkg_3 = (SELECT id FROM bookings WHERE agreement_id = @agr_3 LIMIT 1);
SET @bkg_4 = (SELECT id FROM bookings WHERE agreement_id = @agr_4 LIMIT 1);
SET @bkg_5 = (SELECT id FROM bookings WHERE agreement_id = @agr_5 LIMIT 1);
SET @bkg_6 = (SELECT id FROM bookings WHERE agreement_id = @agr_6 LIMIT 1);

-- Verified client reviews (4 to 5 stars)
INSERT IGNORE INTO reviews (booking_id, client_id, gardener_id, rating, review_text, is_visible) VALUES
  (@bkg_1, @client_1, @g_tetuan,    5, 'Arrived on time in Tetuan and left our Bermuda lawn super crisp and clean. Highly recommended!', TRUE),
  (@bkg_2, @client_2, @g_stamaria,  5, 'Transformed our Sta. Maria terrace with orchids and vertical planters. Very neat work and fair pricing.', TRUE),
  (@bkg_3, @client_1, @g_canelar,   5, 'Canelar Moret Landscape crew finished our tropical backyard right on schedule with great plant selection.', TRUE),
  (@bkg_4, @client_2, @g_pasonanca, 5, 'Very safe mango tree pruning near our roof and they hauled away all cut branches cleanly.', TRUE),
  (@bkg_5, @client_1, @g_guiwan,    4, 'Solid raised herb beds and good loam soil mix. Communication was clear from quote to completion.', TRUE),
  (@bkg_6, @client_2, @g_putik,     5, 'Consistent and thorough yard maintenance—our hedges and flower beds look refreshed every visit.', TRUE);

-- ----------------------------------------------------------------------------
-- 5. Seed 3 Active Open General Requests (for Gardener Open Board & AI Leads)
-- ----------------------------------------------------------------------------
INSERT INTO inquiries
  (request_type, client_id, gardener_id, service_id, category_id, subject, description, requested_date, location, area_sqm, work_complexity, materials_option, site_visit_requested, estimated_min_amount, estimated_max_amount, price_comment, category_specs, status, expires_at)
SELECT
  'general', @client_1, NULL, NULL, @cat_land,
  'Side-yard Tropical Pathway & Palm Planting (Tetuan)',
  'Looking for an approved Zamboanga City crew to redesign our 28 sq.m side-yard with river pebbles, concrete stepping stones, and low-maintenance tropical plants.',
  DATE_ADD(CURDATE(), INTERVAL 7 DAY),
  'Brgy. Tetuan, Zamboanga City',
  28.00, 'moderate', 'gardener_provides', TRUE, 7000.00, 12500.00,
  'Budget is around PHP 9,000-11,000 including pebbles and ornamental plants.',
  JSON_OBJECT('style', 'Tropical modern', 'hardscape', 'Stepping stones & pebbles', 'plantsRequested', 'Santan, dwarf palms, ferns'),
  'open',
  DATE_ADD(NOW(), INTERVAL 21 DAY)
WHERE NOT EXISTS (SELECT 1 FROM inquiries WHERE subject = 'Side-yard Tropical Pathway & Palm Planting (Tetuan)');

INSERT INTO inquiries
  (request_type, client_id, gardener_id, service_id, category_id, subject, description, requested_date, location, area_sqm, work_complexity, materials_option, site_visit_requested, estimated_min_amount, estimated_max_amount, price_comment, category_specs, status, expires_at)
SELECT
  'general', @client_2, NULL, NULL, @cat_tree,
  'Trim 3 Overgrown Palm & Fruit Trees (Sta. Maria)',
  'Need safe canopy trimming for two tall palms and one calamansi/mango area before windy weather, plus branch hauling.',
  DATE_ADD(CURDATE(), INTERVAL 5 DAY),
  'Brgy. Sta. Maria, Zamboanga City',
  25.00, 'moderate', 'client_provides', FALSE, 2000.00, 3800.00,
  'Please include green waste hauling in the offer if possible.',
  JSON_OBJECT('treeCount', '3', 'height', 'Medium-tall (4-6m)', 'debrisDisposal', 'Hauling needed'),
  'open',
  DATE_ADD(NOW(), INTERVAL 21 DAY)
WHERE NOT EXISTS (SELECT 1 FROM inquiries WHERE subject = 'Trim 3 Overgrown Palm & Fruit Trees (Sta. Maria)');

INSERT INTO inquiries
  (request_type, client_id, gardener_id, service_id, category_id, subject, description, requested_date, location, area_sqm, work_complexity, materials_option, site_visit_requested, estimated_min_amount, estimated_max_amount, price_comment, category_specs, status, expires_at)
SELECT
  'general', @client_1, NULL, NULL, @cat_terrace,
  'Balcony Herb & Orchid Shelf Setup (Pasonanca)',
  'Need help setting up a compact 12 sq.m terrace garden with repotted orchids, herbs, and clean drip trays.',
  DATE_ADD(CURDATE(), INTERVAL 10 DAY),
  'Brgy. Pasonanca, Zamboanga City',
  12.00, 'light', 'gardener_provides', FALSE, 1500.00, 2800.00,
  'Open to suggestions for shaded afternoon balcony plants.',
  JSON_OBJECT('spaceType', 'Covered balcony', 'sunlight', 'Morning sun / partial shade', 'potCount', '12-15 pots'),
  'open',
  DATE_ADD(NOW(), INTERVAL 21 DAY)
WHERE NOT EXISTS (SELECT 1 FROM inquiries WHERE subject = 'Balcony Herb & Orchid Shelf Setup (Pasonanca)');
