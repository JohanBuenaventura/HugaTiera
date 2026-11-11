const fs = require('node:fs')
const path = require('node:path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true })

// Enforce that R4 tests run EXCLUSIVELY against the separate test database
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

async function uploadDraftPhoto(cookie, color = { r: 60, g: 140, b: 80 }) {
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
  form.append('image', new Blob([buf], { type: 'image/jpeg' }), 'garden-sample.jpg')

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

describe('Step R4 – Case 2 Direct Service Provider Inquiry End-to-End', () => {
  const runId = Date.now()
  let clientACookie = ''
  let clientBCookie = ''
  let gardener1Cookie = ''
  let gardener2Cookie = ''
  let unapprovedGardenerCookie = ''
  let adminCookie = ''

  let clientAId = null
  let clientBId = null
  let gardener1Id = null
  let gardener2Id = null
  let unapprovedGardenerId = null
  let adminId = null
  let categoryId = null
  let gardener1ServiceId = null
  let gardener2ServiceId = null

  before(async () => {
    const [[dbRow]] = await pool.query('SELECT DATABASE() AS db')
    assert.equal(
      dbRow.db,
      'hugatiera_db_migration_test',
      `Refusing to run R4 tests on ${dbRow.db}; must be hugatiera_db_migration_test`,
    )
    assert.notEqual(dbRow.db, ORIGINAL_DB, 'Must never run against original database')

    server = http.createServer(app)
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const { port } = server.address()
    baseUrl = `http://127.0.0.1:${port}/api`

    const [[catRow]] = await pool.query('SELECT id FROM service_categories WHERE is_active = TRUE LIMIT 1')
    categoryId = catRow.id

    // Register Client A, Client B, Gardener 1, Gardener 2, and Unapproved Gardener
    for (const u of [
      { key: 'clientA', role: 'client', firstName: 'R4ClientA' },
      { key: 'clientB', role: 'client', firstName: 'R4ClientB' },
      { key: 'gardener1', role: 'gardener', firstName: 'R4GardenerOne' },
      { key: 'gardener2', role: 'gardener', firstName: 'R4GardenerTwo' },
      { key: 'unapprovedGardener', role: 'gardener', firstName: 'R4PendingGardener' },
    ]) {
      const res = await apiRequest('/auth/register', {
        method: 'POST',
        body: {
          firstName: u.firstName,
          lastName: 'Tester',
          email: `${u.key}.${runId}@hugatiera.test`,
          phone: '09171234567',
          barangay: 'Tetuan',
          address: 'Tetuan, Zamboanga City',
          password: 'Password123!',
          role: u.role,
        },
      })
      assert.equal(res.status, 201, `Registration failed for ${u.key}: ${JSON.stringify(res.data)}`)
      createdUserIds.push(res.data.user.id)
      if (u.key === 'clientA') {
        clientAId = res.data.user.id
        clientACookie = res.cookie
      } else if (u.key === 'clientB') {
        clientBId = res.data.user.id
        clientBCookie = res.cookie
      } else if (u.key === 'gardener1') {
        gardener1Id = res.data.user.id
        gardener1Cookie = res.cookie
      } else if (u.key === 'gardener2') {
        gardener2Id = res.data.user.id
        gardener2Cookie = res.cookie
      } else if (u.key === 'unapprovedGardener') {
        unapprovedGardenerId = res.data.user.id
        unapprovedGardenerCookie = res.cookie
      }
    }

    // Create admin user for oversight assertions
    const adminHash = await bcrypt.hash('Password123!', 10)
    const [adminIns] = await pool.query(
      `INSERT INTO users (first_name, last_name, email, password_hash, role, is_active)
       VALUES ('R4', 'Admin', ?, ?, 'administrator', TRUE)`,
      [`r4admin.${runId}@hugatiera.test`, adminHash],
    )
    adminId = adminIns.insertId
    createdUserIds.push(adminId)

    const adminLogin = await apiRequest('/auth/login', {
      method: 'POST',
      body: {
        email: `r4admin.${runId}@hugatiera.test`,
        password: 'Password123!',
      },
    })
    assert.equal(adminLogin.status, 200)
    adminCookie = adminLogin.cookie

    // Approve Gardener 1 and Gardener 2 (leave unapprovedGardener as is_approved = FALSE)
    await pool.query(
      `UPDATE gardener_profiles
          SET is_approved = TRUE, business_name = CONCAT('R4 Garden Studio ', user_id)
        WHERE user_id IN (?, ?)`,
      [gardener1Id, gardener2Id],
    )

    // Create active services for Gardener 1 and Gardener 2
    const svc1Res = await apiRequest('/services', {
      method: 'POST',
      cookie: gardener1Cookie,
      body: {
        categoryId,
        title: `R4 Landscape Design & Edging ${runId}`,
        description: 'Custom landscape edging, border planting, and mulching in Zamboanga City.',
        indicativePrice: 2200,
        priceUnit: 'per project',
        serviceArea: 'Zamboanga City',
      },
    })
    assert.equal(svc1Res.status, 201)
    gardener1ServiceId = svc1Res.data.id || svc1Res.data.service?.id
    createdServiceIds.push(gardener1ServiceId)

    const svc2Res = await apiRequest('/services', {
      method: 'POST',
      cookie: gardener2Cookie,
      body: {
        categoryId,
        title: `R4 Tree Pruning ${runId}`,
        description: 'Canopy shaping and branch clearing.',
        indicativePrice: 1800,
        priceUnit: 'per visit',
        serviceArea: 'Zamboanga City',
      },
    })
    assert.equal(svc2Res.status, 201)
    gardener2ServiceId = svc2Res.data.id || svc2Res.data.service?.id
    createdServiceIds.push(gardener2ServiceId)
  })

  after(async () => {
    try {
      if (server) {
        server.closeAllConnections?.()
        await new Promise((resolve) => server.close(resolve))
      }

      for (const filePath of createdImageFiles) {
        try {
          await fs.promises.unlink(filePath)
        } catch (_err) {
          // Ignore already removed test files
        }
      }

      if (createdUserIds.length > 0) {
        const [userInqs] = await pool.query(
          'SELECT id FROM inquiries WHERE client_id IN (?) OR gardener_id IN (?)',
          [createdUserIds, createdUserIds],
        )
        for (const r of userInqs) {
          if (!createdInquiryIds.includes(r.id)) createdInquiryIds.push(r.id)
        }
      }

      if (createdInquiryIds.length > 0) {
        await pool.query('UPDATE agreements SET previous_agreement_id = NULL WHERE inquiry_id IN (?)', [createdInquiryIds])
        await pool.query('DELETE FROM bookings WHERE inquiry_id IN (?)', [createdInquiryIds])
        await pool.query('DELETE FROM agreements WHERE inquiry_id IN (?)', [createdInquiryIds])
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
        await pool.query('DELETE FROM services WHERE id IN (?)', [createdServiceIds])
      }
      if (createdUserIds.length > 0) {
        await pool.query('DELETE FROM request_images WHERE uploaded_by IN (?)', [createdUserIds])
        await pool.query('DELETE FROM notifications WHERE user_id IN (?)', [createdUserIds])
        await pool.query('DELETE FROM users WHERE id IN (?)', [createdUserIds])
      }
    } finally {
      await pool.end()
    }
  })

  test('R4-01: Client submits Case 2 direct inquiry (via serviceId and via gardenerId) with transactional photo attachment', async () => {
    const img1 = await uploadDraftPhoto(clientACookie, { r: 40, g: 130, b: 60 })
    const img2 = await uploadDraftPhoto(clientACookie, { r: 80, g: 150, b: 90 })

    // 1. Direct inquiry via serviceId
    const res1 = await apiRequest('/inquiries', {
      method: 'POST',
      cookie: clientACookie,
      body: {
        serviceId: gardener1ServiceId,
        subject: 'Front yard border edging and ornamental shrubs',
        description: 'Need 18 meters of stone edging and native flowering shrubs planted along the driveway.',
        requestedDate: '2026-12-10',
        location: 'Tetuan, Zamboanga City',
        aiSummary: 'Client requests 18m driveway border edging and drought-tolerant ornamental shrubs.',
        expiresInDays: 10,
        imageIds: [img1.id, img2.id],
      },
    })
    assert.equal(res1.status, 201, `Expected 201, got ${res1.status}: ${JSON.stringify(res1.data)}`)
    const inq1 = res1.data.inquiry
    createdInquiryIds.push(inq1.id)

    assert.equal(inq1.request_type, 'direct')
    assert.equal(inq1.status, 'open')
    assert.equal(inq1.client_id, clientAId)
    assert.equal(inq1.gardener_id, gardener1Id)
    assert.equal(inq1.service_id, gardener1ServiceId)
    assert.equal(inq1.category_id, categoryId)
    assert.equal(inq1.ai_summary, 'Client requests 18m driveway border edging and drought-tolerant ornamental shrubs.')
    assert.ok(inq1.expires_at, 'expires_at should be set when expiresInDays is provided')
    assert.equal(res1.data.images.length, 2)
    assert.deepEqual(
      res1.data.images.map((i) => i.id).sort((a, b) => a - b),
      [img1.id, img2.id].sort((a, b) => a - b),
    )

    // Verify GET /api/inquiries/:id returns inquiry, attached images, and audit event
    const detail1 = await apiRequest(`/inquiries/${inq1.id}`, { cookie: gardener1Cookie })
    assert.equal(detail1.status, 200)
    assert.equal(detail1.data.images.length, 2)
    assert.ok(detail1.data.events.some((ev) => ev.event_type === 'inquiry_created'))

    // 2. Direct inquiry directly to gardenerId without a pre-selected serviceId
    const img3 = await uploadDraftPhoto(clientACookie, { r: 90, g: 160, b: 100 })
    const res2 = await apiRequest('/inquiries', {
      method: 'POST',
      cookie: clientACookie,
      body: {
        gardenerId: gardener1Id,
        categoryId,
        subject: 'Custom backyard garden makeover consultation',
        description: 'Looking for a custom layout for our 60 sqm backyard in Tetuan.',
        requestedDate: '2026-12-12',
        location: 'Tetuan, Zamboanga City',
        imageIds: [img3.id],
      },
    })
    assert.equal(res2.status, 201)
    createdInquiryIds.push(res2.data.inquiry.id)
    assert.equal(res2.data.inquiry.request_type, 'direct')
    assert.equal(res2.data.inquiry.gardener_id, gardener1Id)
    assert.equal(res2.data.inquiry.service_id, null)
    assert.equal(res2.data.inquiry.category_id, categoryId)
    assert.equal(res2.data.images.length, 1)
    assert.equal(res2.data.images[0].id, img3.id)
  })

  test('R4-02: Transactional image attachment rollback preserves draft photos and leaves no partial inquiry when validation fails', async () => {
    const clientADraft = await uploadDraftPhoto(clientACookie, { r: 70, g: 120, b: 70 })
    const clientBDraft = await uploadDraftPhoto(clientBCookie, { r: 120, g: 70, b: 70 })

    const [[beforeCountRow]] = await pool.query('SELECT COUNT(*) AS cnt FROM inquiries WHERE client_id = ?', [clientAId])

    // Attempt to create an inquiry attaching Client A's valid draft + Client B's draft (ownership violation)
    const badRes = await apiRequest('/inquiries', {
      method: 'POST',
      cookie: clientACookie,
      body: {
        serviceId: gardener1ServiceId,
        subject: 'Rollback test inquiry',
        description: 'Should roll back completely because second image belongs to Client B.',
        requestedDate: '2026-12-14',
        location: 'Tetuan, Zamboanga City',
        imageIds: [clientADraft.id, clientBDraft.id],
      },
    })
    assert.equal(badRes.status, 403)

    // Verify no new inquiry row was committed
    const [[afterCountRow]] = await pool.query('SELECT COUNT(*) AS cnt FROM inquiries WHERE client_id = ?', [clientAId])
    assert.equal(afterCountRow.cnt, beforeCountRow.cnt, 'Inquiry row must be rolled back when image attachment fails')

    // Verify Client A's draft image is still unattached (inquiry_id IS NULL) and file still exists on disk
    const [[draftRow]] = await pool.query('SELECT inquiry_id, file_path FROM request_images WHERE id = ?', [clientADraft.id])
    assert.equal(draftRow.inquiry_id, null, 'Client A draft photo must remain unattached after transaction rollback')
    assert.equal(fs.existsSync(resolveRequestImagePath(draftRow.file_path)), true, 'Draft image file must remain intact on disk')
  })

  test('R4-03: Authorization, unavailable/unapproved provider rejection, and Case 2 targeted-gardener enforcement', async () => {
    // 1. Gardeners cannot create inquiries
    const gardenerCreate = await apiRequest('/inquiries', {
      method: 'POST',
      cookie: gardener1Cookie,
      body: {
        gardenerId: gardener2Id,
        subject: 'Gardener trying to create inquiry',
        description: 'Should fail with 403.',
        location: 'Tetuan, Zamboanga City',
      },
    })
    assert.equal(gardenerCreate.status, 403)

    // 2. Unapproved gardener cannot receive direct inquiries
    const unapprovedRes = await apiRequest('/inquiries', {
      method: 'POST',
      cookie: clientACookie,
      body: {
        gardenerId: unapprovedGardenerId,
        subject: 'Inquiry to pending gardener',
        description: 'Should fail with 404 because gardener is not approved.',
        location: 'Tetuan, Zamboanga City',
      },
    })
    assert.equal(unapprovedRes.status, 404)

    // 3. Mismatched serviceId and gardenerId is rejected with 400
    const mismatchRes = await apiRequest('/inquiries', {
      method: 'POST',
      cookie: clientACookie,
      body: {
        serviceId: gardener1ServiceId,
        gardenerId: gardener2Id,
        subject: 'Mismatched service and gardener',
        description: 'Should fail with 400.',
        location: 'Tetuan, Zamboanga City',
      },
    })
    assert.equal(mismatchRes.status, 400)

    // 4. Create a valid Case 2 inquiry targeting Gardener 1
    const inqRes = await apiRequest('/inquiries', {
      method: 'POST',
      cookie: clientACookie,
      body: {
        serviceId: gardener1ServiceId,
        subject: 'Targeted Gardener 1 only test',
        description: 'Only Gardener 1 and Client A may access or respond.',
        requestedDate: '2026-12-15',
        location: 'Tetuan, Zamboanga City',
      },
    })
    assert.equal(inqRes.status, 201)
    const inquiryId = inqRes.data.inquiry.id
    createdInquiryIds.push(inquiryId)

    // 5. Non-targeted approved Gardener 2 cannot view (404) or respond (403) to Gardener 1's Case 2 inquiry
    const g2View = await apiRequest(`/inquiries/${inquiryId}`, { cookie: gardener2Cookie })
    assert.equal(g2View.status, 404)

    const g2Quote = await apiRequest(`/inquiries/${inquiryId}/quotations`, {
      method: 'POST',
      cookie: gardener2Cookie,
      body: {
        responseType: 'offer',
        amount: 2500,
        details: 'Gardener 2 trying to poach Gardener 1 direct inquiry.',
      },
    })
    assert.equal(g2Quote.status, 403)

    // 6. Client B cannot view Client A's inquiry (404)
    const clientBView = await apiRequest(`/inquiries/${inquiryId}`, { cookie: clientBCookie })
    assert.equal(clientBView.status, 404)

    // 7. Administrator can view for platform oversight
    const adminView = await apiRequest(`/inquiries/${inquiryId}`, { cookie: adminCookie })
    assert.equal(adminView.status, 200)
  })

  test('R4-04: Targeted gardener response types, offer revision history, and concurrent duplicate offer serialization', async () => {
    const inqRes = await apiRequest('/inquiries', {
      method: 'POST',
      cookie: clientACookie,
      body: {
        serviceId: gardener1ServiceId,
        subject: 'Slope stabilization and groundcover planting',
        description: 'Need erosion control planting on a 25 sqm sloped area.',
        requestedDate: '2026-12-16',
        location: 'Pasonanca, Zamboanga City',
      },
    })
    assert.equal(inqRes.status, 201)
    const inquiryId = inqRes.data.inquiry.id
    createdInquiryIds.push(inquiryId)

    // 1. responseType = 'modifications' without proposedChanges must fail with 400
    const missingModRes = await apiRequest(`/inquiries/${inquiryId}/quotations`, {
      method: 'POST',
      cookie: gardener1Cookie,
      body: {
        responseType: 'modifications',
        amount: 3200,
        details: 'We can do this with adjustments.',
      },
    })
    assert.equal(missingModRes.status, 400)

    // 2. Concurrent duplicate offer submissions by Gardener 1: exactly one succeeds (201) and the other fails (409)
    const [concurrent1, concurrent2] = await Promise.all([
      apiRequest(`/inquiries/${inquiryId}/quotations`, {
        method: 'POST',
        cookie: gardener1Cookie,
        body: {
          responseType: 'modifications',
          amount: 3400,
          details: 'Initial assessment v1: feasible with terracing adjustments.',
          proposedChanges: 'Add two low bamboo retaining steps before planting peanut grass.',
          availabilityStart: '2026-12-16',
          availabilityEnd: '2026-12-17',
          validUntil: '2026-12-15',
        },
      }),
      apiRequest(`/inquiries/${inquiryId}/quotations`, {
        method: 'POST',
        cookie: gardener1Cookie,
        body: {
          responseType: 'offer',
          amount: 3500,
          details: 'Concurrent duplicate offer attempt.',
          availabilityStart: '2026-12-16',
          availabilityEnd: '2026-12-17',
        },
      }),
    ])

    const statuses = [concurrent1.status, concurrent2.status].sort((a, b) => a - b)
    assert.deepEqual(statuses, [201, 409], `Expected [201, 409] from concurrent offers, got ${JSON.stringify(statuses)}`)

    const createdQuote = concurrent1.status === 201 ? concurrent1.data.quotation : concurrent2.data.quotation
    const quotationId = createdQuote.id

    // If the 'offer' branch won the race, revise it to 'modifications' first so we test both
    if (createdQuote.response_type !== 'modifications') {
      const fixRes = await apiRequest(`/inquiries/quotations/${quotationId}`, {
        method: 'PUT',
        cookie: gardener1Cookie,
        body: {
          responseType: 'modifications',
          amount: 3400,
          details: 'Initial assessment: feasible with terracing adjustments.',
          proposedChanges: 'Add two low bamboo retaining steps before planting peanut grass.',
          availabilityStart: '2026-12-16',
          availabilityEnd: '2026-12-17',
          validUntil: '2026-12-15',
        },
      })
      assert.equal(fixRes.status, 200)
    }

    // Verify inquiry status transitioned to 'responded'
    const afterFirstQuote = await apiRequest(`/inquiries/${inquiryId}`, { cookie: clientACookie })
    assert.equal(afterFirstQuote.status, 200)
    assert.equal(afterFirstQuote.data.inquiry.status, 'responded')

    // 3. Gardener 1 revises the active offer (PUT /api/inquiries/quotations/:quotationId)
    const reviseRes = await apiRequest(`/inquiries/quotations/${quotationId}`, {
      method: 'PUT',
      cookie: gardener1Cookie,
      body: {
        responseType: 'feasible',
        amount: 3100,
        details: 'Revised offer after client clarified existing stone border is already in place.',
        availabilityStart: '2026-12-16',
        availabilityEnd: '2026-12-16',
        validUntil: '2026-12-15',
      },
    })
    assert.equal(reviseRes.status, 200)
    assert.equal(reviseRes.data.quotation.response_type, 'feasible')
    assert.equal(Number(reviseRes.data.quotation.amount), 3100)
    assert.equal(reviseRes.data.quotation.proposed_changes, null)
    assert.ok(reviseRes.data.quotation.revision_number >= 2)
    assert.ok(reviseRes.data.revisions.length >= 1, 'Previous offer revision must be preserved in quotation_revisions')

    // Verify GET /api/inquiries/:id embeds revisions history on the quotation
    const detailWithRevs = await apiRequest(`/inquiries/${inquiryId}`, { cookie: clientACookie })
    assert.equal(detailWithRevs.status, 200)
    const fetchedQuote = detailWithRevs.data.quotations.find((q) => q.id === quotationId)
    assert.ok(fetchedQuote)
    assert.ok(Array.isArray(fetchedQuote.revisions) && fetchedQuote.revisions.length >= 1)
  })

  test('R4-05: Rejected (cannot_do), withdrawn, expired, and cancelled inquiry scenarios', async () => {
    const inqRes = await apiRequest('/inquiries', {
      method: 'POST',
      cookie: clientACookie,
      body: {
        serviceId: gardener1ServiceId,
        subject: 'Large tree removal near power lines',
        description: 'Need 12m mahogany tree trimmed near street lines.',
        requestedDate: '2026-12-18',
        location: 'Guiwan, Zamboanga City',
      },
    })
    assert.equal(inqRes.status, 201)
    const inquiryId = inqRes.data.inquiry.id
    createdInquiryIds.push(inquiryId)

    // 1. Gardener responds with 'cannot_do' (no amount required)
    const cannotDoRes = await apiRequest(`/inquiries/${inquiryId}/quotations`, {
      method: 'POST',
      cookie: gardener1Cookie,
      body: {
        responseType: 'cannot_do',
        details: 'Requires utility company clearance and bucket truck which we do not operate.',
      },
    })
    assert.equal(cannotDoRes.status, 201)
    const cannotDoQuoteId = cannotDoRes.data.quotation.id
    assert.equal(cannotDoRes.data.quotation.response_type, 'cannot_do')
    assert.equal(cannotDoRes.data.quotation.amount, null)

    // 2. Client cannot accept a 'cannot_do' response (409)
    const acceptCannotDo = await apiRequest(`/inquiries/quotations/${cannotDoQuoteId}/status`, {
      method: 'PATCH',
      cookie: clientACookie,
      body: { status: 'accepted' },
    })
    assert.equal(acceptCannotDo.status, 409)

    // 3. Gardener withdraws the 'cannot_do' response -> status = 'withdrawn'
    const withdrawRes = await apiRequest(`/inquiries/quotations/${cannotDoQuoteId}/withdraw`, {
      method: 'POST',
      cookie: gardener1Cookie,
    })
    assert.equal(withdrawRes.status, 200)
    assert.equal(withdrawRes.data.quotation.status, 'withdrawn')

    // 4. After withdrawal (active_flag is NULL), Gardener 1 can submit a new offer for the lower shrubs only
    const newOfferRes = await apiRequest(`/inquiries/${inquiryId}/quotations`, {
      method: 'POST',
      cookie: gardener1Cookie,
      body: {
        responseType: 'modifications',
        amount: 1900,
        details: 'We can prune the lower ornamental shrubs and ground-level branches safely.',
        proposedChanges: 'Exclude branches within 3 meters of overhead lines.',
      },
    })
    assert.equal(newOfferRes.status, 201)
    const secondQuoteId = newOfferRes.data.quotation.id

    // 5. Simulate expiration by setting expires_at in the past on the open/responded inquiry
    await pool.query(
      'UPDATE inquiries SET expires_at = DATE_SUB(NOW(), INTERVAL 2 HOUR) WHERE id = ?',
      [inquiryId],
    )

    // Revise attempt on expired inquiry is blocked with 409 and lazily transitions inquiry to 'expired'
    const reviseExpired = await apiRequest(`/inquiries/quotations/${secondQuoteId}`, {
      method: 'PUT',
      cookie: gardener1Cookie,
      body: {
        responseType: 'offer',
        amount: 1800,
        details: 'Trying to revise after inquiry expired.',
      },
    })
    assert.equal(reviseExpired.status, 409)

    // Accepting quotation on expired inquiry is blocked with 409
    const acceptExpired = await apiRequest(`/inquiries/quotations/${secondQuoteId}/status`, {
      method: 'PATCH',
      cookie: clientACookie,
      body: { status: 'accepted' },
    })
    assert.equal(acceptExpired.status, 409)

    const expiredDetail = await apiRequest(`/inquiries/${inquiryId}`, { cookie: clientACookie })
    assert.equal(expiredDetail.status, 200)
    assert.equal(expiredDetail.data.inquiry.status, 'expired')

    // 6. Test client cancellation on a fresh inquiry
    const cancelInqRes = await apiRequest('/inquiries', {
      method: 'POST',
      cookie: clientACookie,
      body: {
        serviceId: gardener1ServiceId,
        subject: 'Inquiry to be cancelled by client',
        description: 'Testing client cancellation and gardener restriction.',
        location: 'Tetuan, Zamboanga City',
      },
    })
    assert.equal(cancelInqRes.status, 201)
    const cancelInquiryId = cancelInqRes.data.inquiry.id
    createdInquiryIds.push(cancelInquiryId)

    // Gardener cannot set status to 'cancelled' (403)
    const gardenerCancel = await apiRequest(`/inquiries/${cancelInquiryId}/status`, {
      method: 'PATCH',
      cookie: gardener1Cookie,
      body: { status: 'cancelled' },
    })
    assert.equal(gardenerCancel.status, 403)

    // Client cancels inquiry (200)
    const clientCancel = await apiRequest(`/inquiries/${cancelInquiryId}/status`, {
      method: 'PATCH',
      cookie: clientACookie,
      body: { status: 'cancelled' },
    })
    assert.equal(clientCancel.status, 200)
    assert.equal(clientCancel.data.inquiry.status, 'cancelled')

    // Gardener cannot submit offer on cancelled inquiry (409)
    const quoteAfterCancel = await apiRequest(`/inquiries/${cancelInquiryId}/quotations`, {
      method: 'POST',
      cookie: gardener1Cookie,
      body: {
        responseType: 'offer',
        amount: 2000,
        details: 'Offer on cancelled inquiry.',
      },
    })
    assert.equal(quoteAfterCancel.status, 409)
  })

  test('R4-06: End-to-end Case 2 flow — offer acceptance locks quotation, transitions through R3 mutual agreement, and confirms booking', async () => {
    const photo = await uploadDraftPhoto(clientACookie, { r: 50, g: 160, b: 85 })

    // 1. Client A submits Case 2 direct inquiry with photo
    const createRes = await apiRequest('/inquiries', {
      method: 'POST',
      cookie: clientACookie,
      body: {
        serviceId: gardener1ServiceId,
        subject: 'Complete courtyard fern & orchid installation',
        description: 'Install vertical wall planters, fern beds, and drip watering timer.',
        requestedDate: '2026-12-20',
        location: 'Santa Maria, Zamboanga City',
        aiSummary: 'Shaded courtyard installation with ferns, orchids, and basic drip timer.',
        expiresInDays: 7,
        imageIds: [photo.id],
      },
    })
    assert.equal(createRes.status, 201)
    const inquiryId = createRes.data.inquiry.id
    createdInquiryIds.push(inquiryId)

    // 2. Gardener 1 submits offer v1, then revises to v2
    const q1Res = await apiRequest(`/inquiries/${inquiryId}/quotations`, {
      method: 'POST',
      cookie: gardener1Cookie,
      body: {
        responseType: 'modifications',
        amount: 3800,
        details: 'Includes 12 wall pockets, Boston ferns, and manual misting setup.',
        proposedChanges: 'Use manual misting valve instead of battery timer for reliability.',
        availabilityStart: '2026-12-20',
        availabilityEnd: '2026-12-21',
        validUntil: '2026-12-19',
      },
    })
    assert.equal(q1Res.status, 201)
    const quotationId = q1Res.data.quotation.id

    const q2Res = await apiRequest(`/inquiries/quotations/${quotationId}`, {
      method: 'PUT',
      cookie: gardener1Cookie,
      body: {
        responseType: 'feasible',
        amount: 3950,
        details: 'Includes 12 wall pockets, Boston ferns, dendrobium orchids, and battery drip timer.',
        availabilityStart: '2026-12-20',
        availabilityEnd: '2026-12-21',
        validUntil: '2026-12-19',
      },
    })
    assert.equal(q2Res.status, 200)
    assert.equal(q2Res.data.quotation.revision_number, 2)

    // 3. Client A accepts the offer -> quotation is locked, inquiry becomes 'provider_selected', NO booking created yet
    const acceptRes = await apiRequest(`/inquiries/quotations/${quotationId}/status`, {
      method: 'PATCH',
      cookie: clientACookie,
      body: { status: 'accepted' },
    })
    assert.equal(acceptRes.status, 200)
    assert.equal(acceptRes.data.quotation.status, 'accepted')
    assert.ok(acceptRes.data.quotation.locked_at, 'Accepted quotation must set locked_at')
    assert.equal(acceptRes.data.booking, null, 'Accepting an offer must NEVER create a booking directly')

    const [[inqAfterAccept]] = await pool.query('SELECT status FROM inquiries WHERE id = ?', [inquiryId])
    assert.equal(inqAfterAccept.status, 'provider_selected')

    // 4. Unilateral offer revision or withdrawal after acceptance is rejected with 409
    const reviseLocked = await apiRequest(`/inquiries/quotations/${quotationId}`, {
      method: 'PUT',
      cookie: gardener1Cookie,
      body: {
        responseType: 'offer',
        amount: 4500,
        details: 'Attempting to raise price after acceptance.',
      },
    })
    assert.equal(reviseLocked.status, 409)

    const withdrawLocked = await apiRequest(`/inquiries/quotations/${quotationId}/withdraw`, {
      method: 'POST',
      cookie: gardener1Cookie,
    })
    assert.equal(withdrawLocked.status, 409)

    // 5. Even if expires_at passes while in 'provider_selected', lazy expiry must NOT cancel/expire the inquiry
    await pool.query(
      'UPDATE inquiries SET expires_at = DATE_SUB(NOW(), INTERVAL 1 HOUR) WHERE id = ?',
      [inquiryId],
    )
    const checkNotExpired = await apiRequest(`/inquiries/${inquiryId}`, { cookie: clientACookie })
    assert.equal(checkNotExpired.status, 200)
    assert.equal(checkNotExpired.data.inquiry.status, 'provider_selected')

    // 6. Client A proposes Mutual Agreement v1 linked to inquiryId + quotationId
    const propRes = await apiRequest('/agreements', {
      method: 'POST',
      cookie: clientACookie,
      body: {
        inquiryId,
        quotationId,
        scopeOfWork: 'Install 12 wall pockets, Boston ferns, dendrobium orchids, and battery drip timer.',
        amount: 3950,
        priceBasis: 'Fixed project fee including plants and drip timer',
        scheduledStart: '2026-12-20T08:00:00',
        scheduledEnd: '2026-12-20T15:00:00',
        location: 'Santa Maria, Zamboanga City',
        conditions: 'Client provides outdoor faucet access.',
      },
    })
    assert.equal(propRes.status, 201)
    assert.equal(propRes.data.confirmed, false)
    assert.equal(propRes.data.booking, null)
    const agreementV1 = propRes.data.agreement

    // 7. Unilateral approval by Client A does NOT create a booking; Gardener 1's approval of v1 confirms the booking
    const clientApproveRes = await apiRequest(`/agreements/${agreementV1.id}/approve`, {
      method: 'POST',
      cookie: clientACookie,
      body: { version: 1 },
    })
    assert.equal(clientApproveRes.status, 200)
    assert.equal(clientApproveRes.data.confirmed, false)
    assert.equal(clientApproveRes.data.booking, null)

    const approveRes = await apiRequest(`/agreements/${agreementV1.id}/approve`, {
      method: 'POST',
      cookie: gardener1Cookie,
      body: { version: 1 },
    })
    assert.equal(approveRes.status, 200)
    assert.equal(approveRes.data.confirmed, true)
    assert.ok(approveRes.data.booking?.id, 'Booking must be created after both parties approve v1')
    assert.equal(approveRes.data.booking.status, 'accepted')
    assert.equal(Number(approveRes.data.agreement.amount), 3950)
    assert.equal(approveRes.data.booking.agreement_id, agreementV1.id)

    // 8. Confirmed inquiry cannot be closed or cancelled via inquiry status endpoint (409)
    const cancelConfirmed = await apiRequest(`/inquiries/${inquiryId}/status`, {
      method: 'PATCH',
      cookie: clientACookie,
      body: { status: 'cancelled' },
    })
    assert.equal(cancelConfirmed.status, 409)
  })
})
