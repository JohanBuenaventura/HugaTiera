const fs = require('node:fs')
const path = require('node:path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true })

// Enforce that R5 tests run EXCLUSIVELY against the separate test database
const ORIGINAL_DB = process.env.DB_NAME || 'hugatiera_db'
process.env.DB_NAME = 'hugatiera_db_migration_test'

const assert = require('node:assert/strict')
const http = require('node:http')
const { after, before, describe, test } = require('node:test')
const bcrypt = require('bcryptjs')
const sharp = require('sharp')

const app = require('../app')
const { pool } = require('../config/database')
const { resolveRequestImagePath } = require('../middleware/upload.middleware')

let server
let baseUrl
const createdUserIds = []
const createdInquiryIds = []
const createdServiceIds = []
const createdImageFiles = []

function extractCookie(response) {
  const raw = response.headers.get('set-cookie')
  if (!raw) return ''
  return raw.split(';')[0]
}

async function apiRequest(urlPath, { method = 'GET', body, cookie = '', headers = {} } = {}) {
  const requestHeaders = { ...headers }
  if (cookie) requestHeaders.Cookie = cookie

  let payload = body
  if (body && !(body instanceof FormData) && typeof body === 'object') {
    requestHeaders['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }

  const response = await fetch(`${baseUrl}${urlPath}`, {
    method,
    headers: requestHeaders,
    body: payload,
  })

  const data = response.status === 204 ? null : await response.json().catch(() => null)
  return {
    status: response.status,
    data,
    cookie: extractCookie(response) || cookie,
    headers: response.headers,
  }
}

async function uploadDraftPhoto(cookie, color = { r: 50, g: 130, b: 70 }) {
  const buf = await sharp({
    create: {
      width: 320,
      height: 240,
      channels: 3,
      background: color,
    },
  })
    .jpeg({ quality: 80 })
    .toBuffer()

  const form = new FormData()
  form.append('image', new Blob([buf], { type: 'image/jpeg' }), 'general-request-photo.jpg')

  const res = await apiRequest('/request-images', {
    method: 'POST',
    cookie,
    body: form,
  })
  assert.equal(res.status, 201, `Draft image upload failed: ${JSON.stringify(res.data)}`)

  const [[imgRow]] = await pool.query('SELECT file_path FROM request_images WHERE id = ?', [res.data.image.id])
  if (imgRow?.file_path) {
    createdImageFiles.push(resolveRequestImagePath(imgRow.file_path))
  }
  return res.data.image
}

describe('Step R5 – Case 1 General Service Request, Open Provider Board, Multi-Provider Offers & Comparison End-to-End', () => {
  const runId = Date.now()
  let clientACookie = ''
  let clientBCookie = ''
  let gardener1Cookie = ''
  let gardener2Cookie = ''
  let gardener3Cookie = ''
  let unapprovedGardenerCookie = ''
  let adminCookie = ''

  let clientAId = null
  let clientBId = null
  let gardener1Id = null
  let gardener2Id = null
  let gardener3Id = null
  let unapprovedGardenerId = null
  let adminId = null
  let categoryId = null
  let secondCategoryId = null

  before(async () => {
    const [[dbRow]] = await pool.query('SELECT DATABASE() AS db')
    assert.equal(dbRow.db, 'hugatiera_db_migration_test', 'Must run against hugatiera_db_migration_test')
    assert.notEqual(dbRow.db, ORIGINAL_DB === 'hugatiera_db_migration_test' ? 'hugatiera_db' : ORIGINAL_DB)

    // Clean up any leftover r5.* test rows from an interrupted run
    const [staleUsers] = await pool.query("SELECT id FROM users WHERE email LIKE 'r5.%@hugatiera.test'")
    if (staleUsers.length > 0) {
      const staleUserIds = staleUsers.map((u) => u.id)
      const [staleInq] = await pool.query('SELECT id FROM inquiries WHERE client_id IN (?)', [staleUserIds])
      if (staleInq.length > 0) {
        const sInqIds = staleInq.map((i) => i.id)
        await pool.query('UPDATE agreements SET previous_agreement_id = NULL WHERE inquiry_id IN (?)', [sInqIds])
        await pool.query('DELETE FROM bookings WHERE inquiry_id IN (?)', [sInqIds])
        await pool.query('DELETE FROM agreements WHERE inquiry_id IN (?)', [sInqIds])
        await pool.query('DELETE FROM request_events WHERE inquiry_id IN (?)', [sInqIds])
        await pool.query('DELETE FROM request_images WHERE inquiry_id IN (?)', [sInqIds])
        await pool.query(
          'DELETE FROM quotation_revisions WHERE quotation_id IN (SELECT id FROM quotations WHERE inquiry_id IN (?))',
          [sInqIds],
        )
        await pool.query('DELETE FROM quotations WHERE inquiry_id IN (?)', [sInqIds])
        await pool.query('DELETE FROM inquiries WHERE id IN (?)', [sInqIds])
      }
      await pool.query('DELETE FROM messages WHERE sender_id IN (?)', [staleUserIds])
      await pool.query(
        'DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE client_id IN (?) OR gardener_id IN (?))',
        [staleUserIds, staleUserIds],
      )
      await pool.query('DELETE FROM conversations WHERE client_id IN (?) OR gardener_id IN (?)', [staleUserIds, staleUserIds])
      await pool.query('DELETE FROM reviews WHERE gardener_id IN (?) OR client_id IN (?)', [staleUserIds, staleUserIds])
      await pool.query('DELETE FROM bookings WHERE gardener_id IN (?) OR client_id IN (?)', [staleUserIds, staleUserIds])
      await pool.query('DELETE FROM services WHERE gardener_id IN (?)', [staleUserIds])
      await pool.query('DELETE FROM request_images WHERE uploaded_by IN (?)', [staleUserIds])
      await pool.query('DELETE FROM notifications WHERE user_id IN (?)', [staleUserIds])
      await pool.query('DELETE FROM users WHERE id IN (?)', [staleUserIds])
    }

    server = http.createServer(app)
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const { port } = server.address()
    baseUrl = `http://127.0.0.1:${port}/api`

    const password = 'Password123!'
    const hash = await bcrypt.hash(password, 10)

    // Client A (has street address and phone in client_profiles/users to test privacy masking)
    const [cARes] = await pool.execute(
      `INSERT INTO users (first_name, last_name, email, phone, password_hash, role, is_active)
       VALUES ('ClientA', 'SecretLastName', ?, '09171234567', ?, 'client', 1)`,
      [`r5.clienta.${runId}@hugatiera.test`, hash],
    )
    clientAId = cARes.insertId
    createdUserIds.push(clientAId)
    await pool.execute(
      `INSERT INTO client_profiles (user_id, address, city, bio)
       VALUES (?, '999 Private Street, Tetuan', 'Zamboanga City', 'Loves tropical gardens')`,
      [clientAId],
    )

    // Client B
    const [cBRes] = await pool.execute(
      `INSERT INTO users (first_name, last_name, email, password_hash, role, is_active)
       VALUES ('ClientB', 'R5', ?, ?, 'client', 1)`,
      [`r5.clientb.${runId}@hugatiera.test`, hash],
    )
    clientBId = cBRes.insertId
    createdUserIds.push(clientBId)
    await pool.execute('INSERT INTO client_profiles (user_id) VALUES (?)', [clientBId])

    // Gardener 1 (approved, with portfolio and completed booking/review for comparison stats)
    const [g1Res] = await pool.execute(
      `INSERT INTO users (first_name, last_name, email, password_hash, role, is_active)
       VALUES ('GardenerOne', 'R5', ?, ?, 'gardener', 1)`,
      [`r5.gardener1.${runId}@hugatiera.test`, hash],
    )
    gardener1Id = g1Res.insertId
    createdUserIds.push(gardener1Id)
    await pool.execute(
      `INSERT INTO gardener_profiles (user_id, business_name, description, service_area, years_of_experience, is_approved)
       VALUES (?, 'Zamboanga Green Thumb', 'Landscape design and lawn care specialist', 'Tetuan, Zamboanga City', 7, 1)`,
      [gardener1Id],
    )
    await pool.execute(
      `INSERT INTO portfolios (gardener_id, title, description, image_path)
       VALUES (?, 'Tropical Courtyard Makeover', 'Completed courtyard in Tetuan', '/uploads/portfolios/sample1.jpg')`,
      [gardener1Id],
    )

    // Gardener 2 (approved)
    const [g2Res] = await pool.execute(
      `INSERT INTO users (first_name, last_name, email, password_hash, role, is_active)
       VALUES ('GardenerTwo', 'R5', ?, ?, 'gardener', 1)`,
      [`r5.gardener2.${runId}@hugatiera.test`, hash],
    )
    gardener2Id = g2Res.insertId
    createdUserIds.push(gardener2Id)
    await pool.execute(
      `INSERT INTO gardener_profiles (user_id, business_name, description, service_area, years_of_experience, is_approved)
       VALUES (?, 'Pasonanca Botanical Care', 'Pruning and garden maintenance', 'Pasonanca, Zamboanga City', 4, 1)`,
      [gardener2Id],
    )

    // Gardener 3 (approved, used to test Case 1 conversation gating when no offer is submitted)
    const [g3Res] = await pool.execute(
      `INSERT INTO users (first_name, last_name, email, password_hash, role, is_active)
       VALUES ('GardenerThree', 'R5', ?, ?, 'gardener', 1)`,
      [`r5.gardener3.${runId}@hugatiera.test`, hash],
    )
    gardener3Id = g3Res.insertId
    createdUserIds.push(gardener3Id)
    await pool.execute(
      `INSERT INTO gardener_profiles (user_id, business_name, service_area, years_of_experience, is_approved)
       VALUES (?, 'Guiwan Garden Works', 'Guiwan, Zamboanga City', 2, 1)`,
      [gardener3Id],
    )

    // Unapproved Gardener
    const [ugRes] = await pool.execute(
      `INSERT INTO users (first_name, last_name, email, password_hash, role, is_active)
       VALUES ('PendingGardener', 'R5', ?, ?, 'gardener', 1)`,
      [`r5.unapproved.${runId}@hugatiera.test`, hash],
    )
    unapprovedGardenerId = ugRes.insertId
    createdUserIds.push(unapprovedGardenerId)
    await pool.execute(
      `INSERT INTO gardener_profiles (user_id, business_name, service_area, is_approved)
       VALUES (?, 'Pending Garden Co', 'Zamboanga City', 0)`,
      [unapprovedGardenerId],
    )

    // Admin
    const [admRes] = await pool.execute(
      `INSERT INTO users (first_name, last_name, email, password_hash, role, is_active)
       VALUES ('Admin', 'R5', ?, ?, 'administrator', 1)`,
      [`r5.admin.${runId}@hugatiera.test`, hash],
    )
    adminId = admRes.insertId
    createdUserIds.push(adminId)

    // Ensure at least two active categories exist
    const [cats] = await pool.query('SELECT id FROM service_categories WHERE is_active = 1 ORDER BY id ASC LIMIT 2')
    if (cats.length >= 2) {
      categoryId = cats[0].id
      secondCategoryId = cats[1].id
    } else {
      const [c1] = await pool.execute(
        "INSERT INTO service_categories (name, description, is_active) VALUES (?, 'Test category 1', 1)",
        [`Landscaping R5 ${runId}`],
      )
      const [c2] = await pool.execute(
        "INSERT INTO service_categories (name, description, is_active) VALUES (?, 'Test category 2', 1)",
        [`Pruning R5 ${runId}`],
      )
      categoryId = c1.insertId
      secondCategoryId = c2.insertId
    }

    // Create a completed booking + review for Gardener 1 so comparison metrics are populated
    const [svcRes] = await pool.execute(
      `INSERT INTO services (gardener_id, category_id, title, description, indicative_price, price_unit, service_area, is_active)
       VALUES (?, ?, 'Garden Setup R5', 'Full setup', 3000.00, 'per project', 'Zamboanga City', 1)`,
      [gardener1Id, categoryId],
    )
    createdServiceIds.push(svcRes.insertId)
    const [compBooking] = await pool.execute(
      `INSERT INTO bookings (client_id, gardener_id, service_id, scheduled_start, scheduled_end, status, location, notes)
       VALUES (?, ?, ?, DATE_SUB(NOW(), INTERVAL 10 DAY), DATE_SUB(NOW(), INTERVAL 9 DAY), 'completed', 'Tetuan, Zamboanga City', 'Completed setup')`,
      [clientBId, gardener1Id, svcRes.insertId],
    )
    await pool.execute(
      `INSERT INTO reviews (booking_id, client_id, gardener_id, rating, review_text)
       VALUES (?, ?, ?, 5, 'Excellent landscaping work!')`,
      [compBooking.insertId, clientBId, gardener1Id],
    )

    // Log in all test actors
    const login = async (email) => {
      const res = await apiRequest('/auth/login', {
        method: 'POST',
        body: { email, password },
      })
      assert.equal(res.status, 200, `Login failed for ${email}`)
      return res.cookie
    }

    clientACookie = await login(`r5.clienta.${runId}@hugatiera.test`)
    clientBCookie = await login(`r5.clientb.${runId}@hugatiera.test`)
    gardener1Cookie = await login(`r5.gardener1.${runId}@hugatiera.test`)
    gardener2Cookie = await login(`r5.gardener2.${runId}@hugatiera.test`)
    gardener3Cookie = await login(`r5.gardener3.${runId}@hugatiera.test`)
    unapprovedGardenerCookie = await login(`r5.unapproved.${runId}@hugatiera.test`)
    adminCookie = await login(`r5.admin.${runId}@hugatiera.test`)
  })

  after(async () => {
    try {
      if (server) {
        await new Promise((resolve) => server.close(resolve))
      }

      for (const filePath of createdImageFiles) {
        try {
          if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath)
        } catch {
          // ignore cleanup error
        }
      }

      if (createdInquiryIds.length > 0) {
        await pool.query('UPDATE agreements SET previous_agreement_id = NULL WHERE inquiry_id IN (?)', [createdInquiryIds])
        await pool.query('DELETE FROM bookings WHERE inquiry_id IN (?)', [createdInquiryIds])
        await pool.query('DELETE FROM agreements WHERE inquiry_id IN (?)', [createdInquiryIds])
        await pool.query(
          'DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE inquiry_id IN (?))',
          [createdInquiryIds],
        )
        await pool.query('DELETE FROM conversations WHERE inquiry_id IN (?)', [createdInquiryIds])
        await pool.query('DELETE FROM request_events WHERE inquiry_id IN (?)', [createdInquiryIds])
        await pool.query('DELETE FROM request_images WHERE inquiry_id IN (?)', [createdInquiryIds])
        await pool.query(
          'DELETE FROM quotation_revisions WHERE quotation_id IN (SELECT id FROM quotations WHERE inquiry_id IN (?))',
          [createdInquiryIds],
        )
        await pool.query('DELETE FROM quotations WHERE inquiry_id IN (?)', [createdInquiryIds])
        await pool.query('DELETE FROM inquiries WHERE id IN (?)', [createdInquiryIds])
      }
      if (createdServiceIds.length > 0) {
        await pool.query('DELETE FROM reviews WHERE gardener_id IN (?)', [createdUserIds])
        await pool.query('DELETE FROM bookings WHERE service_id IN (?)', [createdServiceIds])
        await pool.query('DELETE FROM services WHERE id IN (?)', [createdServiceIds])
      }
      if (createdUserIds.length > 0) {
        await pool.query('DELETE FROM messages WHERE sender_id IN (?)', [createdUserIds])
        await pool.query(
          'DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE client_id IN (?) OR gardener_id IN (?))',
          [createdUserIds, createdUserIds],
        )
        await pool.query('DELETE FROM conversations WHERE client_id IN (?) OR gardener_id IN (?)', [createdUserIds, createdUserIds])
        await pool.query('DELETE FROM request_images WHERE uploaded_by IN (?)', [createdUserIds])
        await pool.query('DELETE FROM notifications WHERE user_id IN (?)', [createdUserIds])
        await pool.query('DELETE FROM users WHERE id IN (?)', [createdUserIds])
      }
    } finally {
      await pool.end()
    }
  })

  test('R5-01: Client creates Case 1 General Service Request with garden photo, category, area-level location, and validity period; rejects serviceId/gardenerId on general requests', async () => {
    // Reject serviceId or gardenerId when requestType === 'general'
    const badGeneral = await apiRequest('/inquiries', {
      method: 'POST',
      cookie: clientACookie,
      body: {
        requestType: 'general',
        gardenerId: gardener1Id,
        subject: 'Invalid general request with gardenerId',
        description: 'Should be rejected with 400.',
      },
    })
    assert.equal(badGeneral.status, 400)
    assert.match(badGeneral.data.message, /must not target a specific service or gardener/i)

    // Reject out-of-range expiresInDays
    const badExpiry = await apiRequest('/inquiries', {
      method: 'POST',
      cookie: clientACookie,
      body: {
        requestType: 'general',
        subject: 'Invalid expiry request',
        description: 'Should reject expiresInDays > 90.',
        expiresInDays: 120,
      },
    })
    assert.equal(badExpiry.status, 400)

    // Upload draft garden photo and create valid Case 1 general request
    const draftImg = await uploadDraftPhoto(clientACookie)
    const createRes = await apiRequest('/inquiries', {
      method: 'POST',
      cookie: clientACookie,
      body: {
        requestType: 'general',
        categoryId,
        subject: 'Backyard slope landscaping and ornamental plants',
        description: 'Need low-maintenance native ornamental plants and edging along 25 sqm slope.',
        aiSummary: '25 sqm backyard slope; recommends native shrubs, mulch edging, and drainage check.',
        requestedDate: '2026-12-10',
        location: 'Tetuan, Zamboanga City',
        expiresInDays: 14,
        imageIds: [draftImg.id],
      },
    })
    assert.equal(createRes.status, 201, `Create general request failed: ${JSON.stringify(createRes.data)}`)
    const inquiryId = createRes.data.id
    createdInquiryIds.push(inquiryId)

    assert.equal(createRes.data.inquiry.request_type, 'general')
    assert.equal(createRes.data.inquiry.gardener_id, null)
    assert.equal(createRes.data.inquiry.service_id, null)
    assert.equal(createRes.data.inquiry.category_id, categoryId)
    assert.equal(createRes.data.inquiry.status, 'open')
    assert.ok(createRes.data.inquiry.expires_at, 'expires_at should be set (~14 days in future)')
    assert.equal(createRes.data.images.length, 1)
    assert.equal(createRes.data.images[0].id, draftImg.id)
  })

  test('R5-02: Open Requests Board (GET /api/inquiries/open) enforces role/approval access, supports category & area filters, and masks client street address/contact details', async () => {
    const draftImg = await uploadDraftPhoto(clientACookie, { r: 90, g: 150, b: 60 })
    const createRes = await apiRequest('/inquiries', {
      method: 'POST',
      cookie: clientACookie,
      body: {
        requestType: 'general',
        categoryId,
        subject: 'Open Board Privacy & Filter Test Request',
        description: 'Front lawn renovation and hedge shaping.',
        location: 'Tetuan, Zamboanga City',
        expiresInDays: 7,
        imageIds: [draftImg.id],
      },
    })
    assert.equal(createRes.status, 201)
    const inquiryId = createRes.data.id
    createdInquiryIds.push(inquiryId)

    // 1. Clients cannot access GET /api/inquiries/open (403)
    const clientBoardRes = await apiRequest('/inquiries/open', { cookie: clientACookie })
    assert.equal(clientBoardRes.status, 403)

    // 2. Unapproved gardeners cannot access GET /api/inquiries/open (403)
    const unapprovedBoardRes = await apiRequest('/inquiries/open', { cookie: unapprovedGardenerCookie })
    assert.equal(unapprovedBoardRes.status, 403)
    assert.match(unapprovedBoardRes.data.message, /approved/i)

    // 3. Approved Gardener 1 sees the open request on the board with area-level location only
    const g1BoardRes = await apiRequest(`/inquiries/open?categoryId=${categoryId}&area=Tetuan`, {
      cookie: gardener1Cookie,
    })
    assert.equal(g1BoardRes.status, 200)
    const item = g1BoardRes.data.requests.find((r) => r.id === inquiryId)
    assert.ok(item, 'Expected open general request to appear on Open Requests Board')
    assert.equal(item.location, 'Tetuan, Zamboanga City')
    assert.equal(item.client_first_name, 'ClientA')
    // Ensure private client fields are NOT exposed on the open board
    assert.equal(item.client_last_name, undefined)
    assert.equal(item.address, undefined)
    assert.equal(item.phone, undefined)
    assert.equal(item.email, undefined)
    assert.ok(!JSON.stringify(item).includes('999 Private Street'), 'Street address must never leak on open board')
    assert.ok(!JSON.stringify(item).includes('SecretLastName'), 'Client last name must not leak on open board')
    assert.equal(item.images.length, 1)

    // 4. Approved Gardener 1 can also fetch the attached garden photo via authenticated delivery
    const imgRes = await apiRequest(`/request-images/${draftImg.id}`, { cookie: gardener1Cookie })
    assert.equal(imgRes.status, 200)

    // 5. Filtering by a non-matching category or area excludes the request
    const mismatchCategoryRes = await apiRequest(`/inquiries/open?categoryId=${secondCategoryId}`, {
      cookie: gardener1Cookie,
    })
    assert.equal(mismatchCategoryRes.status, 200)
    assert.equal(mismatchCategoryRes.data.requests.some((r) => r.id === inquiryId), false)

    const mismatchAreaRes = await apiRequest('/inquiries/open?area=MercedesNonExistentArea', {
      cookie: gardener1Cookie,
    })
    assert.equal(mismatchAreaRes.status, 200)
    assert.equal(mismatchAreaRes.data.requests.some((r) => r.id === inquiryId), false)

    // 6. Administrator can also inspect the open requests board
    const adminBoardRes = await apiRequest('/inquiries/open', { cookie: adminCookie })
    assert.equal(adminBoardRes.status, 200)
    assert.equal(adminBoardRes.data.requests.some((r) => r.id === inquiryId), true)
  })

  test('R5-03: Multi-provider offers, offer revisions, offer isolation between competing gardeners, and rich client comparison view', async () => {
    const createRes = await apiRequest('/inquiries', {
      method: 'POST',
      cookie: clientACookie,
      body: {
        requestType: 'general',
        categoryId,
        subject: 'Multi-Provider Comparison Garden Request',
        description: 'Complete garden bed preparation and seasonal planting.',
        location: 'Tetuan, Zamboanga City',
        expiresInDays: 14,
      },
    })
    assert.equal(createRes.status, 201)
    const inquiryId = createRes.data.id
    createdInquiryIds.push(inquiryId)

    // Unapproved gardener cannot submit an offer (403)
    const unapprovedOffer = await apiRequest(`/inquiries/${inquiryId}/quotations`, {
      method: 'POST',
      cookie: unapprovedGardenerCookie,
      body: {
        responseType: 'interest',
        details: 'I want to bid.',
      },
    })
    assert.equal(unapprovedOffer.status, 403)

    // Gardener 1 submits an initial expression of interest (v1)
    const g1OfferRes = await apiRequest(`/inquiries/${inquiryId}/quotations`, {
      method: 'POST',
      cookie: gardener1Cookie,
      body: {
        responseType: 'interest',
        amount: 4500,
        details: 'Interested in preparing your garden beds; can visit this week.',
        availabilityStart: '2026-12-11',
        availabilityEnd: '2026-12-13',
      },
    })
    assert.equal(g1OfferRes.status, 201)
    const g1QuoteId = g1OfferRes.data.id

    // Gardener 1 cannot submit a second simultaneous active offer (409)
    const g1DupOffer = await apiRequest(`/inquiries/${inquiryId}/quotations`, {
      method: 'POST',
      cookie: gardener1Cookie,
      body: {
        responseType: 'offer',
        amount: 4200,
        details: 'Second active offer attempt',
      },
    })
    assert.equal(g1DupOffer.status, 409)

    // Gardener 1 revises their active offer to v2 ('feasible' with updated price)
    const g1ReviseRes = await apiRequest(`/inquiries/quotations/${g1QuoteId}`, {
      method: 'PUT',
      cookie: gardener1Cookie,
      body: {
        responseType: 'feasible',
        amount: 4200,
        details: 'Revised offer including organic compost and edging.',
        availabilityStart: '2026-12-11',
        availabilityEnd: '2026-12-12',
      },
    })
    assert.equal(g1ReviseRes.status, 200)
    assert.equal(g1ReviseRes.data.quotation.revision_number, 2)
    assert.equal(Number(g1ReviseRes.data.quotation.amount), 4200)

    // Gardener 2 submits a competing offer ('modifications') on the same general request
    const g2OfferRes = await apiRequest(`/inquiries/${inquiryId}/quotations`, {
      method: 'POST',
      cookie: gardener2Cookie,
      body: {
        responseType: 'modifications',
        amount: 3800,
        details: 'Can complete with native drought-tolerant plants.',
        proposedChanges: 'Use bougainvillea and dwarf pandakaki for sun-exposed border.',
        availabilityStart: '2026-12-14',
        availabilityEnd: '2026-12-15',
      },
    })
    assert.equal(g2OfferRes.status, 201)
    const g2QuoteId = g2OfferRes.data.id

    // Offer Isolation Check: Gardener 1 viewing GET /api/inquiries/:id only sees Gardener 1's own offer
    const g1DetailRes = await apiRequest(`/inquiries/${inquiryId}`, { cookie: gardener1Cookie })
    assert.equal(g1DetailRes.status, 200)
    assert.equal(g1DetailRes.data.quotations.length, 1)
    assert.equal(g1DetailRes.data.quotations[0].id, g1QuoteId)
    assert.equal(g1DetailRes.data.inquiry.client_last_name, null, 'Client last name masked before selection')

    // Gardener 2 viewing GET /api/inquiries/:id only sees Gardener 2's own offer
    const g2DetailRes = await apiRequest(`/inquiries/${inquiryId}`, { cookie: gardener2Cookie })
    assert.equal(g2DetailRes.status, 200)
    assert.equal(g2DetailRes.data.quotations.length, 1)
    assert.equal(g2DetailRes.data.quotations[0].id, g2QuoteId)

    // Client Comparison Check: Client A sees BOTH offers with full provider comparison metadata & revision history
    const clientDetailRes = await apiRequest(`/inquiries/${inquiryId}`, { cookie: clientACookie })
    assert.equal(clientDetailRes.status, 200)
    assert.equal(clientDetailRes.data.inquiry.status, 'responded')
    assert.equal(clientDetailRes.data.quotations.length, 2)

    const quoteFromG1 = clientDetailRes.data.quotations.find((q) => q.id === g1QuoteId)
    const quoteFromG2 = clientDetailRes.data.quotations.find((q) => q.id === g2QuoteId)
    assert.ok(quoteFromG1)
    assert.ok(quoteFromG2)

    // Verify Gardener 1 comparison metadata (rating, review_count, completed_bookings, experience_years, portfolios, revisions)
    assert.equal(quoteFromG1.gardener_name, 'Zamboanga Green Thumb')
    assert.equal(Number(quoteFromG1.gardener_experience_years), 7)
    assert.equal(Number(quoteFromG1.gardener_rating), 5)
    assert.equal(Number(quoteFromG1.gardener_review_count), 1)
    assert.equal(Number(quoteFromG1.gardener_completed_bookings), 1)
    assert.ok(Array.isArray(quoteFromG1.gardener_portfolios) && quoteFromG1.gardener_portfolios.length >= 1)
    assert.equal(quoteFromG1.revisions.length, 1)
    assert.equal(Number(quoteFromG1.revisions[0].amount), 4500)

    // ISS-02 Check: Admin activity endpoint includes unassigned Case 1 general requests
    const adminActivityRes = await apiRequest('/admin/activity', { cookie: adminCookie })
    assert.equal(adminActivityRes.status, 200)
    const adminInqItem = adminActivityRes.data.inquiries.find((i) => i.id === inquiryId)
    assert.ok(adminInqItem, 'Unassigned Case 1 general request must be visible in Admin Activity')
    assert.equal(adminInqItem.request_type, 'general')
    assert.equal(adminInqItem.gardener_name, 'Open Board')

    // ISS-03 Check: Gardener profile inquiry count includes Case 1 requests where the gardener submitted an offer
    const g2ProfileRes = await apiRequest('/profiles/me', { cookie: gardener2Cookie })
    assert.equal(g2ProfileRes.status, 200)
    assert.ok(
      Number(g2ProfileRes.data.counts.inquiries) >= 1,
      'Gardener inquiry count must include Case 1 general requests where the gardener submitted an offer',
    )
  })

  test('R5-04: Case 1 Conversation Gating — only providers who have submitted an active offer on a general request can open or message in a conversation with the client', async () => {
    const createRes = await apiRequest('/inquiries', {
      method: 'POST',
      cookie: clientACookie,
      body: {
        requestType: 'general',
        categoryId,
        subject: 'Conversation Gating General Request',
        description: 'Need pruning and mulching for mango and calamansi trees.',
        location: 'Tetuan, Zamboanga City',
      },
    })
    assert.equal(createRes.status, 201)
    const inquiryId = createRes.data.id
    createdInquiryIds.push(inquiryId)

    // 1. Gardener 3 (who has NOT submitted an offer) is blocked from creating a conversation (403)
    const g3BlockedConv = await apiRequest('/conversations', {
      method: 'POST',
      cookie: gardener3Cookie,
      body: { inquiryId },
    })
    assert.equal(g3BlockedConv.status, 403)
    assert.match(g3BlockedConv.data.message, /after submitting an offer/i)

    // 2. Client A cannot start a conversation with Gardener 3 either because Gardener 3 has no offer (403)
    const clientBlockedConv = await apiRequest('/conversations', {
      method: 'POST',
      cookie: clientACookie,
      body: { inquiryId, gardenerId: gardener3Id },
    })
    assert.equal(clientBlockedConv.status, 403)

    // 3. Gardener 1 and Gardener 2 both submit offers on the general request
    const g1Offer = await apiRequest(`/inquiries/${inquiryId}/quotations`, {
      method: 'POST',
      cookie: gardener1Cookie,
      body: { responseType: 'offer', amount: 2500, details: 'Gardener 1 pruning offer' },
    })
    assert.equal(g1Offer.status, 201)

    const g2Offer = await apiRequest(`/inquiries/${inquiryId}/quotations`, {
      method: 'POST',
      cookie: gardener2Cookie,
      body: { responseType: 'offer', amount: 2700, details: 'Gardener 2 pruning offer' },
    })
    assert.equal(g2Offer.status, 201)

    // 4. Gardener 1 opens a conversation with Client A; Client A opens a separate conversation with Gardener 2
    const g1ConvRes = await apiRequest('/conversations', {
      method: 'POST',
      cookie: gardener1Cookie,
      body: { inquiryId },
    })
    assert.equal(g1ConvRes.status, 201)
    const conv1Id = g1ConvRes.data.id

    const g2ConvRes = await apiRequest('/conversations', {
      method: 'POST',
      cookie: clientACookie,
      body: { inquiryId, gardenerId: gardener2Id },
    })
    assert.equal(g2ConvRes.status, 201)
    const conv2Id = g2ConvRes.data.id
    assert.notEqual(conv1Id, conv2Id, 'Each provider on a Case 1 request gets a distinct conversation thread')

    // 5. Both Gardener 1 and Gardener 2 can exchange messages with Client A
    const g1Msg = await apiRequest(`/conversations/${conv1Id}/messages`, {
      method: 'POST',
      cookie: gardener1Cookie,
      body: { message: 'Hello Client A, how tall are the mango trees?' },
    })
    assert.equal(g1Msg.status, 201)

    const g2Msg = await apiRequest(`/conversations/${conv2Id}/messages`, {
      method: 'POST',
      cookie: gardener2Cookie,
      body: { message: 'Hi Client A, I can bring organic mulch as well.' },
    })
    assert.equal(g2Msg.status, 201)

    // 6. If Gardener 2 withdraws their offer, Gardener 2 can no longer send new messages in that Case 1 conversation (403)
    const withdrawRes = await apiRequest(`/inquiries/quotations/${g2Offer.data.id}/withdraw`, {
      method: 'POST',
      cookie: gardener2Cookie,
    })
    assert.equal(withdrawRes.status, 200)

    const g2BlockedMsg = await apiRequest(`/conversations/${conv2Id}/messages`, {
      method: 'POST',
      cookie: gardener2Cookie,
      body: { message: 'Trying to message after withdrawing offer' },
    })
    assert.equal(g2BlockedMsg.status, 403)
  })

  test('R5-05: Expiration, "My inquiries & offers" visibility for expired requests, and Client Renewal (POST /api/inquiries/:id/renew)', async () => {
    const createRes = await apiRequest('/inquiries', {
      method: 'POST',
      cookie: clientACookie,
      body: {
        requestType: 'general',
        categoryId,
        subject: 'Expiration and Renewal Test Request',
        description: 'Testing lazy expiry, offer-holder visibility, and client renewal.',
        location: 'Pasonanca, Zamboanga City',
        expiresInDays: 7,
      },
    })
    assert.equal(createRes.status, 201)
    const inquiryId = createRes.data.id
    createdInquiryIds.push(inquiryId)

    // Gardener 1 submits an offer while the request is open
    const g1Offer = await apiRequest(`/inquiries/${inquiryId}/quotations`, {
      method: 'POST',
      cookie: gardener1Cookie,
      body: { responseType: 'offer', amount: 3100, details: 'Offer before expiration' },
    })
    assert.equal(g1Offer.status, 201)

    // Move expires_at to the past to simulate expiration
    await pool.execute(
      'UPDATE inquiries SET expires_at = DATE_SUB(NOW(), INTERVAL 2 HOUR) WHERE id = ?',
      [inquiryId],
    )

    // 1. Expired request no longer appears on GET /api/inquiries/open
    const openBoardRes = await apiRequest('/inquiries/open', { cookie: gardener2Cookie })
    assert.equal(openBoardRes.status, 200)
    assert.equal(openBoardRes.data.requests.some((r) => r.id === inquiryId), false)

    // 2. Gardener 2 (no offer) trying to submit an offer on the expired request gets 409
    const lateOffer = await apiRequest(`/inquiries/${inquiryId}/quotations`, {
      method: 'POST',
      cookie: gardener2Cookie,
      body: { responseType: 'offer', amount: 2900, details: 'Too late offer' },
    })
    assert.equal(lateOffer.status, 409)
    assert.match(lateOffer.data.message, /expired/i)

    // 3. Gardener 1 (who already submitted an offer) still sees the request in GET /api/inquiries labelled 'expired'
    const g1ListRes = await apiRequest('/inquiries', { cookie: gardener1Cookie })
    assert.equal(g1ListRes.status, 200)
    const expiredInList = g1ListRes.data.inquiries.find((i) => i.id === inquiryId)
    assert.ok(expiredInList, 'Provider who submitted an offer must still see expired request in their list')
    assert.equal(expiredInList.status, 'expired')
    assert.equal(expiredInList.my_quotation_status, 'sent')

    // 4. Client A cannot accept Gardener 1's offer while the inquiry is expired (409)
    const acceptWhileExpired = await apiRequest(`/inquiries/quotations/${g1Offer.data.id}/status`, {
      method: 'PATCH',
      cookie: clientACookie,
      body: { status: 'accepted' },
    })
    assert.equal(acceptWhileExpired.status, 409)

    // 5. Non-owner Client B cannot renew Client A's inquiry (403)
    const wrongClientRenew = await apiRequest(`/inquiries/${inquiryId}/renew`, {
      method: 'POST',
      cookie: clientBCookie,
      body: { expiresInDays: 14 },
    })
    assert.equal(wrongClientRenew.status, 403)

    // 6. Client A renews the expired inquiry for 14 days -> status restores to 'responded' (since Gardener 1's offer is still 'sent')
    const renewRes = await apiRequest(`/inquiries/${inquiryId}/renew`, {
      method: 'POST',
      cookie: clientACookie,
      body: { expiresInDays: 14 },
    })
    assert.equal(renewRes.status, 200)
    assert.equal(renewRes.data.status, 'responded')
    assert.equal(renewRes.data.inquiry.status, 'responded')

    // 7. Renewed request re-appears on GET /api/inquiries/open
    const boardAfterRenew = await apiRequest('/inquiries/open', { cookie: gardener2Cookie })
    assert.equal(boardAfterRenew.status, 200)
    assert.equal(boardAfterRenew.data.requests.some((r) => r.id === inquiryId), true)
  })

  test('R5-06: End-to-End Case 1 provider selection, re-selection after declining an un-agreed offer, and R3 Mutual Agreement confirmation', async () => {
    const createRes = await apiRequest('/inquiries', {
      method: 'POST',
      cookie: clientACookie,
      body: {
        requestType: 'general',
        categoryId,
        subject: 'End-to-End Case 1 Selection & Mutual Agreement',
        description: 'Complete backyard lawn installation and border planting.',
        location: 'Tetuan, Zamboanga City',
        expiresInDays: 14,
      },
    })
    assert.equal(createRes.status, 201)
    const inquiryId = createRes.data.id
    createdInquiryIds.push(inquiryId)

    // Gardener 1, Gardener 2, and Gardener 3 all submit offers
    const g1Offer = await apiRequest(`/inquiries/${inquiryId}/quotations`, {
      method: 'POST',
      cookie: gardener1Cookie,
      body: { responseType: 'offer', amount: 6000, details: 'Gardener 1 complete lawn offer' },
    })
    assert.equal(g1Offer.status, 201)

    const g2Offer = await apiRequest(`/inquiries/${inquiryId}/quotations`, {
      method: 'POST',
      cookie: gardener2Cookie,
      body: { responseType: 'feasible', amount: 5500, details: 'Gardener 2 complete lawn offer' },
    })
    assert.equal(g2Offer.status, 201)

    const g3Offer = await apiRequest(`/inquiries/${inquiryId}/quotations`, {
      method: 'POST',
      cookie: gardener3Cookie,
      body: { responseType: 'offer', amount: 5800, details: 'Gardener 3 complete lawn offer' },
    })
    assert.equal(g3Offer.status, 201)

    // 1. Client A accepts Gardener 1's offer first -> status becomes 'provider_selected', gardener_id = gardener1Id, booking is still null
    const acceptG1 = await apiRequest(`/inquiries/quotations/${g1Offer.data.id}/status`, {
      method: 'PATCH',
      cookie: clientACookie,
      body: { status: 'accepted' },
    })
    assert.equal(acceptG1.status, 200)
    assert.equal(acceptG1.data.inquiryStatus, 'provider_selected')
    assert.equal(acceptG1.data.booking, null, 'Accepting an offer must NEVER create a booking directly')
    assert.ok(acceptG1.data.quotation.locked_at, 'Accepted offer must be locked')

    // 2. While Gardener 1's offer is accepted, Client A cannot accept Gardener 2's offer simultaneously (409)
    const acceptG2WhileG1 = await apiRequest(`/inquiries/quotations/${g2Offer.data.id}/status`, {
      method: 'PATCH',
      cookie: clientACookie,
      body: { status: 'accepted' },
    })
    assert.equal(acceptG2WhileG1.status, 409)

    // 3. Before any agreement is proposed, Client A decides to decline Gardener 1's accepted offer -> inquiry returns to 'responded' and gardener_id resets to NULL
    const declineAcceptedG1 = await apiRequest(`/inquiries/quotations/${g1Offer.data.id}/status`, {
      method: 'PATCH',
      cookie: clientACookie,
      body: { status: 'declined' },
    })
    assert.equal(declineAcceptedG1.status, 200)
    assert.equal(declineAcceptedG1.data.inquiryStatus, 'responded')

    const afterDeclineDetail = await apiRequest(`/inquiries/${inquiryId}`, { cookie: clientACookie })
    assert.equal(afterDeclineDetail.data.inquiry.status, 'responded')
    assert.equal(afterDeclineDetail.data.inquiry.gardener_id, null)

    // 4. Client A now accepts Gardener 2's offer -> status becomes 'provider_selected' and gardener_id = gardener2Id
    const acceptG2 = await apiRequest(`/inquiries/quotations/${g2Offer.data.id}/status`, {
      method: 'PATCH',
      cookie: clientACookie,
      body: { status: 'accepted' },
    })
    assert.equal(acceptG2.status, 200)
    assert.equal(acceptG2.data.inquiryStatus, 'provider_selected')

    // 5. Client A proposes Mutual Agreement v1 with Gardener 2 (which auto-approves for Client A)
    const proposeRes = await apiRequest(`/inquiries/${inquiryId}/agreements`, {
      method: 'POST',
      cookie: clientACookie,
      body: {
        quotationId: g2Offer.data.id,
        scopeOfWork: 'Install 30 sqm carabao grass lawn and plant 12 border shrubs.',
        amount: 5500,
        priceBasis: 'Fixed project price including soil prep',
        scheduledStart: '2026-12-20 08:00:00',
        scheduledEnd: '2026-12-20 17:00:00',
        location: '999 Private Street, Tetuan, Zamboanga City',
        conditions: 'Client provides water access.',
      },
    })
    assert.equal(proposeRes.status, 201)
    assert.equal(proposeRes.data.confirmed, false)
    assert.equal(proposeRes.data.booking, null)
    const agreementId = proposeRes.data.agreement.id

    // 6. While an active agreement exists, Client A cannot decline Gardener 2's accepted offer without cancelling the agreement first (409)
    const declineDuringAgreement = await apiRequest(`/inquiries/quotations/${g2Offer.data.id}/status`, {
      method: 'PATCH',
      cookie: clientACookie,
      body: { status: 'declined' },
    })
    assert.equal(declineDuringAgreement.status, 409)

    // 7. Client A approves Agreement v1 first (unilateral approval creates no booking)
    const cAApprove = await apiRequest(`/agreements/${agreementId}/approve`, {
      method: 'POST',
      cookie: clientACookie,
      body: { expectedVersion: 1 },
    })
    assert.equal(cAApprove.status, 200)
    assert.equal(cAApprove.data.confirmed, false)
    assert.equal(cAApprove.data.booking, null)

    // 8. Gardener 2 approves Agreement v1 -> both parties have approved v1 -> Booking is created and Gardener 3's remaining 'sent' offer is automatically declined
    const g2Approve = await apiRequest(`/agreements/${agreementId}/approve`, {
      method: 'POST',
      cookie: gardener2Cookie,
      body: { expectedVersion: 1 },
    })
    assert.equal(g2Approve.status, 200)
    assert.equal(g2Approve.data.confirmed, true)
    assert.ok(g2Approve.data.booking?.id, 'Booking must be created after both parties approve v1')
    assert.equal(g2Approve.data.booking.status, 'accepted')
    assert.equal(g2Approve.data.booking.gardener_id, gardener2Id)

    // Verify inquiry is 'confirmed' and Gardener 3's competing offer was auto-declined
    const finalDetail = await apiRequest(`/inquiries/${inquiryId}`, { cookie: clientACookie })
    assert.equal(finalDetail.status, 200)
    assert.equal(finalDetail.data.inquiry.status, 'confirmed')
    const g3FinalQuote = finalDetail.data.quotations.find((q) => q.id === g3Offer.data.id)
    assert.equal(g3FinalQuote.status, 'declined', 'Competing open offers must be declined once booking is confirmed')
  })
})
