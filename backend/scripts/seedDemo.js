const path = require('node:path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true })
const bcrypt = require('bcryptjs')
const { pool } = require('../config/database')

const DEMO_PASSWORD = process.env.DEMO_SEED_PASSWORD || 'DemoPass123!'

async function ensureUser({
  email,
  role,
  canClient = false,
  canGardener = false,
  firstName,
  lastName,
  phone = '09171234567',
  dob = '1994-05-15',
  clientProfile = null,
  gardenerProfile = null,
}) {
  const [existing] = await pool.execute('SELECT id FROM users WHERE email = ? LIMIT 1', [email])
  let userId = existing[0]?.id

  if (!userId) {
    const hash = await bcrypt.hash(DEMO_PASSWORD, 10)
    const [res] = await pool.execute(
      `INSERT INTO users
        (email, password_hash, role, can_act_as_client, can_act_as_gardener, first_name, last_name, phone, date_of_birth)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [email, hash, role, canClient ? 1 : 0, canGardener ? 1 : 0, firstName, lastName, phone, dob],
    )
    userId = res.insertId
  }

  if (clientProfile) {
    await pool.execute(
      `INSERT INTO client_profiles (user_id, address, city, bio)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE address = COALESCE(address, VALUES(address))`,
      [userId, clientProfile.address, clientProfile.city || 'Zamboanga City', clientProfile.bio || null],
    )
  }

  if (gardenerProfile) {
    await pool.execute(
      `INSERT INTO gardener_profiles
        (user_id, business_name, description, service_area, years_of_experience,
         working_days, work_start_time, work_end_time, max_concurrent_jobs, crew_size, is_approved)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)
       ON DUPLICATE KEY UPDATE is_approved = TRUE`,
      [
        userId,
        gardenerProfile.businessName,
        gardenerProfile.description,
        gardenerProfile.serviceArea,
        gardenerProfile.years,
        gardenerProfile.workingDays || 'mon,tue,wed,thu,fri,sat',
        gardenerProfile.startTime || '08:00:00',
        gardenerProfile.endTime || '17:00:00',
        gardenerProfile.maxConcurrent || 2,
        gardenerProfile.crewSize || 3,
      ],
    )
  }

  return userId
}

async function ensureService({ gardenerId, categoryId, title, description, price, unit, area, workersRequired = 1 }) {
  const [existing] = await pool.execute(
    'SELECT id FROM services WHERE gardener_id = ? AND title = ? LIMIT 1',
    [gardenerId, title],
  )
  if (existing[0]) return existing[0].id
  const [res] = await pool.execute(
    `INSERT INTO services
      (gardener_id, category_id, title, description, indicative_price, price_unit, service_area, workers_required, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
    [gardenerId, categoryId, title, description, price, unit, area, workersRequired],
  )
  return res.insertId
}

async function run() {
  console.log(`Seeding HugaTiera demo data into "${process.env.DB_NAME || 'hugatiera_db'}"...`)

  const [cats] = await pool.query('SELECT id, name FROM service_categories WHERE is_active = TRUE ORDER BY id ASC')
  if (cats.length === 0) {
    throw new Error('No active service categories found. Run the base schema first.')
  }
  const catByName = (keyword) => (cats.find((c) => c.name.toLowerCase().includes(keyword)) || cats[0]).id

  const adminId = await ensureUser({
    email: 'admin.demo@hugatiera.local',
    role: 'administrator',
    firstName: 'Elena',
    lastName: 'Reyes',
  })

  const clientId = await ensureUser({
    email: 'client.demo@hugatiera.local',
    role: 'client',
    canClient: true,
    firstName: 'Marco',
    lastName: 'Villanueva',
    clientProfile: {
      address: '142 Veterans Ave, Brgy. Tetuan',
      city: 'Zamboanga City',
      bio: 'Homeowner looking for regular tropical lawn care and backyard landscaping.',
    },
  })

  const gardener1Id = await ensureUser({
    email: 'verde.gardener@hugatiera.local',
    role: 'gardener',
    canGardener: true,
    firstName: 'Ramon',
    lastName: 'Dela Cruz',
    gardenerProfile: {
      businessName: 'Verde Zamboanga Landscapes',
      description: 'Full-crew residential landscaping, Bermuda grass installation, ornamental plants, and seasonal garden maintenance across Zamboanga City.',
      serviceArea: 'Tetuan, Guiwan, Tumaga, Zamboanga City',
      years: 7,
      maxConcurrent: 2,
      crewSize: 4,
    },
  })

  const gardener2Id = await ensureUser({
    email: 'tetuan.lawn@hugatiera.local',
    role: 'gardener',
    canGardener: true,
    firstName: 'Liza',
    lastName: 'Mendoza',
    gardenerProfile: {
      businessName: 'Tetuan Lawn & Plant Care',
      description: 'Precision lawn mowing, hedge shaping, potted terrace gardens, and organic soil care.',
      serviceArea: 'Tetuan, Putik, Sta. Maria, Zamboanga City',
      years: 5,
      maxConcurrent: 2,
      crewSize: 2,
    },
  })

  const dualUserId = await ensureUser({
    email: 'dual.demo@hugatiera.local',
    role: 'client',
    canClient: true,
    canGardener: true,
    firstName: 'Sofia',
    lastName: 'Alvarez',
    clientProfile: {
      address: 'Brgy. Sta. Maria',
      city: 'Zamboanga City',
      bio: 'Uses HugaTiera both as a homeowner client and a weekend potted-garden specialist.',
    },
    gardenerProfile: {
      businessName: 'Sofia Terrace & Potted Gardens',
      description: 'Balcony, terrace, and indoor-outdoor potted plant styling.',
      serviceArea: 'Sta. Maria, Pasonanca, Zamboanga City',
      years: 3,
      maxConcurrent: 1,
      crewSize: 1,
    },
  })

  const clerkId = await ensureUser({
    email: 'clerk.demo@hugatiera.local',
    role: 'clerk',
    firstName: 'Carlo',
    lastName: 'Santos',
  })

  await pool.execute(
    `INSERT IGNORE INTO clerk_gardener_assignments (clerk_id, gardener_id, assigned_by, notes)
     VALUES (?, ?, ?, 'Manages schedules, crew availability, and GCash/online payment verifications')`,
    [clerkId, gardener1Id, adminId],
  )

  const svc1 = await ensureService({
    gardenerId: gardener1Id,
    categoryId: catByName('landscap'),
    title: 'Tropical Backyard Landscaping & Turfing',
    description: 'Site clearing, garden soil leveling, Bermuda/Carabao grass turf installation, and ornamental border planting for residential yards.',
    price: 4500,
    unit: 'starting package',
    area: 'Tetuan, Guiwan, Zamboanga City',
    workersRequired: 3,
  })

  await ensureService({
    gardenerId: gardener1Id,
    categoryId: catByName('maint'),
    title: 'Monthly Full-Yard Garden Maintenance',
    description: 'Scheduled weeding, shrub trimming, organic fertilizing, and leaf cleanup for medium to large residential gardens.',
    price: 1800,
    unit: 'per visit',
    area: 'Tetuan, Tumaga, Zamboanga City',
    workersRequired: 2,
  })

  await ensureService({
    gardenerId: gardener2Id,
    categoryId: catByName('lawn'),
    title: 'Precision Lawn Mowing & Hedge Shaping',
    description: 'Clean grass cutting, pathway edging, hedge pruning, and green-waste bagging.',
    price: 950,
    unit: 'per visit',
    area: 'Tetuan, Putik, Sta. Maria, Zamboanga City',
    workersRequired: 1,
  })

  await ensureService({
    gardenerId: dualUserId,
    categoryId: catByName('potted'),
    title: 'Balcony & Terrace Potted Garden Styling',
    description: 'Custom container arrangements with low-maintenance tropical plants, coco peat soil mix, and drainage pebbles.',
    price: 1500,
    unit: 'per terrace',
    area: 'Sta. Maria, Pasonanca, Zamboanga City',
    workersRequired: 1,
  })

  // Seed 1 open general request with structured landscaping specs (if none exists for client)
  const [openExists] = await pool.execute(
    "SELECT id FROM inquiries WHERE client_id = ? AND subject = 'Front yard tropical landscaping makeover' LIMIT 1",
    [clientId],
  )
  if (!openExists[0]) {
    await pool.execute(
      `INSERT INTO inquiries
        (client_id, request_type, category_id, subject, description, location, area_sqm, work_complexity, materials_option,
         site_visit_requested, estimated_min_amount, estimated_max_amount, category_specs, status, expires_at)
       VALUES (?, 'general', ?, 'Front yard tropical landscaping makeover',
               'Looking for an approved Zamboanga City landscaping crew to clear weeds, add garden soil, lay Carabao grass, and plant ornamental palms along the front fence.',
               'Brgy. Tetuan, Zamboanga City', 45, 'moderate', 'provider_supplied',
               TRUE, 6500.00, 11500.00, ?, 'open', DATE_ADD(NOW(), INTERVAL 14 DAY))`,
      [
        clientId,
        catByName('landscap'),
        JSON.stringify({
          categoryKey: 'landscaping',
          estimatedSqm: '45',
          requestedPlants: 'Dwarf Palm, San Francisco, Bougainvillea',
          materialsNeeded: 'Carabao grass turf, garden soil, stepping stones',
          designStyle: 'Tropical / Resort-style',
          estimatedBudgetPhp: '9000',
        }),
      ],
    )
  }

  // Seed 1 closed completed booking + verified 5-star review for Verde Zamboanga Landscapes
  const [revExists] = await pool.execute(
    'SELECT id FROM reviews WHERE client_id = ? AND gardener_id = ? LIMIT 1',
    [clientId, gardener1Id],
  )
  if (!revExists[0]) {
    const [inqRes] = await pool.execute(
      `INSERT INTO inquiries (client_id, gardener_id, service_id, category_id, request_type, subject, description, location, status)
       VALUES (?, ?, ?, ?, 'direct', 'Completed backyard lawn & border revamp', 'Full lawn cleanup and ornamental border installation.', 'Brgy. Tetuan, Zamboanga City', 'confirmed')`,
      [clientId, gardener1Id, svc1, catByName('landscap')],
    )
    const [agRes] = await pool.execute(
      `INSERT INTO agreements
        (inquiry_id, client_id, gardener_id, version, scope_of_work, amount, required_deposit_amount,
         scheduled_start, scheduled_end, location, proposed_by, client_approved_at, gardener_approved_at, status)
       VALUES (?, ?, ?, 1, 'Backyard lawn clearing, soil leveling, and ornamental border planting.', 4500.00, 1350.00,
               DATE_SUB(NOW(), INTERVAL 7 DAY), DATE_SUB(NOW(), INTERVAL 6 DAY), 'Brgy. Tetuan, Zamboanga City', ?,
               DATE_SUB(NOW(), INTERVAL 9 DAY), DATE_SUB(NOW(), INTERVAL 9 DAY), 'agreed')`,
      [inqRes.insertId, clientId, gardener1Id, gardener1Id],
    )
    const [bookRes] = await pool.execute(
      `INSERT INTO bookings
        (inquiry_id, agreement_id, client_id, gardener_id, service_id, scheduled_start, scheduled_end, location,
         status, booking_stage, payment_status, required_deposit_amount, amount_paid, paid_at,
         transaction_status, client_completion_confirmed_at, gardener_completion_confirmed_at, transaction_closed_at)
       VALUES (?, ?, ?, ?, ?, DATE_SUB(NOW(), INTERVAL 7 DAY), DATE_SUB(NOW(), INTERVAL 6 DAY), 'Brgy. Tetuan, Zamboanga City',
               'completed', 'booked', 'fully_paid', 1350.00, 4500.00, DATE_SUB(NOW(), INTERVAL 8 DAY),
               'closed', DATE_SUB(NOW(), INTERVAL 5 DAY), DATE_SUB(NOW(), INTERVAL 5 DAY), DATE_SUB(NOW(), INTERVAL 5 DAY))`,
      [inqRes.insertId, agRes.insertId, clientId, gardener1Id, svc1],
    )
    await pool.execute(
      `INSERT INTO booking_payments
        (transaction_code, booking_id, submitted_by, payment_type, payment_method, gateway_provider, gateway_status,
         amount, reference_number, status, verified_by, verified_at, gateway_paid_at)
       VALUES ('TXN-DEMO-SEED01', ?, ?, 'full', 'gcash', 'sandbox_demo', 'paid', 4500.00, 'DEMO-SEED-GCASH', 'verified', ?, NOW(), NOW())`,
      [bookRes.insertId, clientId, gardener1Id],
    )
    await pool.execute(
      `INSERT INTO reviews (booking_id, client_id, gardener_id, rating, review_text, is_visible)
       VALUES (?, ?, ?, 5, 'Ramon and his crew arrived on time, worked neatly, and transformed our front yard in a single day. Highly recommended in Zamboanga City!', TRUE)`,
      [bookRes.insertId, clientId, gardener1Id],
    )
  }

  console.log('\nDemo seed complete! Demo credentials (password for all: ' + DEMO_PASSWORD + '):')
  console.log('  Administrator : admin.demo@hugatiera.local')
  console.log('  Client        : client.demo@hugatiera.local')
  console.log('  Gardener 1    : verde.gardener@hugatiera.local  (Crew: 4, Approved, 5-star review)')
  console.log('  Gardener 2    : tetuan.lawn@hugatiera.local     (Crew: 2, Approved)')
  console.log('  Dual Role     : dual.demo@hugatiera.local       (Client + Gardener)')
  console.log('  Assigned Clerk: clerk.demo@hugatiera.local      (Assigned to Verde Zamboanga Landscapes)')
}

run()
  .then(() => pool.end())
  .catch((err) => {
    console.error('Seed failed:', err)
    pool.end().finally(() => process.exit(1))
  })
