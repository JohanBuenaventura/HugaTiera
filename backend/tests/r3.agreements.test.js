const path = require('node:path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true })

// Enforce that R3 tests run EXCLUSIVELY against the separate test database
const ORIGINAL_DB = process.env.DB_NAME || 'hugatiera_db'
process.env.DB_NAME = 'hugatiera_db_migration_test'

const assert = require('node:assert/strict')
const http = require('node:http')
const { after, before, describe, test } = require('node:test')
const bcrypt = require('bcryptjs')

const app = require('../app')
const { pool } = require('../config/database')
const { approveAgreement } = require('../controllers/agreement.controller')

let server
let baseUrl
const createdUserIds = []
const createdInquiryIds = []
const createdServiceIds = []

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

describe('Step R3 – Mutual Agreement Engine, Versioning, Concurrency & Booking Gating', () => {
  const runId = Date.now()
  let clientACookie = ''
  let clientBCookie = ''
  let gardener1Cookie = ''
  let gardener2Cookie = ''
  let adminCookie = ''

  let clientAId = null
  let clientBId = null
  let gardener1Id = null
  let gardener2Id = null
  let adminId = null
  let categoryId = null
  let pricedServiceId = null

  before(async () => {
    const [[dbRow]] = await pool.query('SELECT DATABASE() AS db')
    assert.equal(
      dbRow.db,
      'hugatiera_db_migration_test',
      `Refusing to run R3 tests on ${dbRow.db}; must be hugatiera_db_migration_test`,
    )
    assert.notEqual(dbRow.db, ORIGINAL_DB, 'Must never run against original database')

    server = http.createServer(app)
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const { port } = server.address()
    baseUrl = `http://127.0.0.1:${port}/api`

    const [[catRow]] = await pool.query('SELECT id FROM service_categories WHERE is_active = TRUE LIMIT 1')
    categoryId = catRow.id

    // Register Client A, Client B, Gardener 1, Gardener 2
    for (const u of [
      { key: 'clientA', role: 'client', firstName: 'ClientA' },
      { key: 'clientB', role: 'client', firstName: 'ClientB' },
      { key: 'gardener1', role: 'gardener', firstName: 'GardenerOne' },
      { key: 'gardener2', role: 'gardener', firstName: 'GardenerTwo' },
    ]) {
      const res = await apiRequest('/auth/register', {
        method: 'POST',
        body: {
          firstName: u.firstName,
          lastName: 'R3Test',
          email: `r3.${u.key}.${runId}@hugatiera.test`,
          password: 'Password123',
          role: u.role,
        },
      })
      assert.equal(res.status, 201)
      createdUserIds.push(res.data.user.id)
      if (u.key === 'clientA') { clientACookie = res.cookie; clientAId = res.data.user.id }
      if (u.key === 'clientB') { clientBCookie = res.cookie; clientBId = res.data.user.id }
      if (u.key === 'gardener1') { gardener1Cookie = res.cookie; gardener1Id = res.data.user.id }
      if (u.key === 'gardener2') { gardener2Cookie = res.cookie; gardener2Id = res.data.user.id }
    }

    await pool.execute(
      'UPDATE gardener_profiles SET is_approved = TRUE, business_name = CONCAT("Garden Biz ", user_id) WHERE user_id IN (?, ?)',
      [gardener1Id, gardener2Id],
    )

    // Create temporary administrator account
    const hash = await bcrypt.hash('Password123', 10)
    const [adminIns] = await pool.execute(
      `INSERT INTO users (email, password_hash, role, first_name, last_name, is_active)
       VALUES (?, ?, 'administrator', 'R3Admin', 'Tester', TRUE)`,
      [`r3.admin.${runId}@hugatiera.test`, hash],
    )
    adminId = adminIns.insertId
    createdUserIds.push(adminId)

    const adminLogin = await apiRequest('/auth/login', {
      method: 'POST',
      body: { email: `r3.admin.${runId}@hugatiera.test`, password: 'Password123' },
    })
    assert.equal(adminLogin.status, 200)
    adminCookie = adminLogin.cookie

    // Create a priced service owned by Gardener 1
    const svcRes = await apiRequest('/services', {
      method: 'POST',
      cookie: gardener1Cookie,
      body: {
        title: `R3 Priced Lawn Service ${runId}`,
        description: 'Standard lawn trimming and edging.',
        categoryId,
        indicativePrice: 1800,
        priceUnit: 'per visit',
        serviceArea: 'Zamboanga City',
      },
    })
    assert.equal(svcRes.status, 201)
    pricedServiceId = svcRes.data.id
    createdServiceIds.push(pricedServiceId)
  })

  after(async () => {
    approveAgreement._testBeforeBookingHook = null
    if (server) {
      await new Promise((resolve) => server.close(resolve))
    }

    if (createdUserIds.length > 0) {
      const placeholders = createdUserIds.map(() => '?').join(', ')
      await pool.execute(`DELETE FROM reviews WHERE client_id IN (${placeholders}) OR gardener_id IN (${placeholders})`, [...createdUserIds, ...createdUserIds])
      await pool.execute(`DELETE FROM bookings WHERE client_id IN (${placeholders}) OR gardener_id IN (${placeholders})`, [...createdUserIds, ...createdUserIds])
      await pool.execute(`DELETE FROM agreements WHERE client_id IN (${placeholders}) OR gardener_id IN (${placeholders})`, [...createdUserIds, ...createdUserIds])
      await pool.execute(`DELETE FROM quotations WHERE gardener_id IN (${placeholders})`, createdUserIds)
      await pool.execute(`DELETE FROM inquiries WHERE client_id IN (${placeholders}) OR gardener_id IN (${placeholders})`, [...createdUserIds, ...createdUserIds])
      await pool.execute(`DELETE FROM services WHERE gardener_id IN (${placeholders})`, createdUserIds)
      await pool.execute(`DELETE FROM client_profiles WHERE user_id IN (${placeholders})`, createdUserIds)
      await pool.execute(`DELETE FROM gardener_profiles WHERE user_id IN (${placeholders})`, createdUserIds)
      await pool.execute(`DELETE FROM users WHERE id IN (${placeholders})`, createdUserIds)
    }

    await pool.end()
  })

  async function createHelperInquiryWithOffers({ general = false } = {}) {
    const [ins] = await pool.execute(
      `INSERT INTO inquiries (request_type, client_id, gardener_id, category_id, subject, description, location, status)
       VALUES (?, ?, ?, ?, 'R3 Garden Work', 'Trim hedges and clear weeds', 'Tetuan, Zamboanga City', 'responded')`,
      [general ? 'general' : 'direct', clientAId, general ? null : gardener1Id, categoryId],
    )
    const inqId = ins.insertId
    createdInquiryIds.push(inqId)

    const [q1] = await pool.execute(
      `INSERT INTO quotations (inquiry_id, gardener_id, amount, details, status, response_type)
       VALUES (?, ?, 2200.00, 'Gardener 1 full hedge and weed package', 'accepted', 'offer')`,
      [inqId, gardener1Id],
    )
    let q2Id = null
    if (general) {
      const [q2] = await pool.execute(
        `INSERT INTO quotations (inquiry_id, gardener_id, amount, details, status, response_type)
         VALUES (?, ?, 2500.00, 'Gardener 2 competing offer', 'sent', 'offer')`,
        [inqId, gardener2Id],
      )
      q2Id = q2.insertId
    }
    return { inquiryId: inqId, quotation1Id: q1.insertId, quotation2Id: q2Id }
  }

  test('R3-01: Direct POST /api/bookings bypass is blocked (409) and agreement validation/auth guards are enforced', async () => {
    const { inquiryId, quotation1Id } = await createHelperInquiryWithOffers()

    // 1. Direct booking from quotation is blocked with 409 MUTUAL_AGREEMENT_REQUIRED
    const bypassQuote = await apiRequest('/bookings', {
      method: 'POST',
      cookie: clientACookie,
      body: {
        quotationId: quotation1Id,
        scheduledStart: '2027-01-10T09:00',
        scheduledEnd: '2027-01-10T11:00',
        location: 'Tetuan, Zamboanga City',
      },
    })
    assert.equal(bypassQuote.status, 409)
    assert.equal(bypassQuote.data.code, 'MUTUAL_AGREEMENT_REQUIRED')

    // 2. Direct booking from priced service is blocked with 409 MUTUAL_AGREEMENT_REQUIRED
    const bypassService = await apiRequest('/bookings', {
      method: 'POST',
      cookie: clientACookie,
      body: {
        serviceId: pricedServiceId,
        scheduledStart: '2027-01-10T09:00',
        scheduledEnd: '2027-01-10T11:00',
        location: 'Tetuan, Zamboanga City',
      },
    })
    assert.equal(bypassService.status, 409)
    assert.equal(bypassService.data.code, 'MUTUAL_AGREEMENT_REQUIRED')

    // 3. Unauthenticated proposal -> 401
    const unauth = await apiRequest(`/inquiries/${inquiryId}/agreements`, {
      method: 'POST',
      body: {
        scopeOfWork: 'Trim hedges',
        amount: 2200,
        scheduledStart: '2027-01-10T09:00',
        scheduledEnd: '2027-01-10T11:00',
        location: 'Tetuan, Zamboanga City',
      },
    })
    assert.equal(unauth.status, 401)

    // 4. Non-party (Client B or Gardener 2) proposing on Client A + Gardener 1's inquiry -> 403
    for (const outsiderCookie of [clientBCookie, gardener2Cookie]) {
      const outsider = await apiRequest(`/inquiries/${inquiryId}/agreements`, {
        method: 'POST',
        cookie: outsiderCookie,
        body: {
          scopeOfWork: 'Trim hedges',
          amount: 2200,
          scheduledStart: '2027-01-10T09:00',
          scheduledEnd: '2027-01-10T11:00',
          location: 'Tetuan, Zamboanga City',
        },
      })
      assert.equal(outsider.status, 403)
    }

    // 5. Invalid schedule (end <= start) -> 400
    const badSchedule = await apiRequest(`/inquiries/${inquiryId}/agreements`, {
      method: 'POST',
      cookie: clientACookie,
      body: {
        scopeOfWork: 'Trim hedges',
        amount: 2200,
        scheduledStart: '2027-01-10T11:00',
        scheduledEnd: '2027-01-10T09:00',
        location: 'Tetuan, Zamboanga City',
      },
    })
    assert.equal(badSchedule.status, 400)
  })

  test('R3-02, R3-03, R3-04 & R3-05: Unilateral approval creates no booking; editing creates v2 & resets both approvals; stale approval is rejected; two-party approval on v2 confirms booking', async () => {
    const { inquiryId, quotation1Id, quotation2Id } = await createHelperInquiryWithOffers({ general: true })

    // 1. Propose v1 (both approvals start as NULL)
    const propRes = await apiRequest(`/inquiries/${inquiryId}/agreements`, {
      method: 'POST',
      cookie: clientACookie,
      body: {
        quotationId: quotation1Id,
        scopeOfWork: 'Initial scope v1: Trim front and back hedges',
        amount: 2200,
        priceBasis: 'fixed project',
        scheduledStart: '2027-01-15T08:00',
        scheduledEnd: '2027-01-15T12:00',
        location: '123 Calle Real, Tetuan, Zamboanga City',
        conditions: 'Client provides green waste bags',
      },
    })
    assert.equal(propRes.status, 201)
    const v1 = propRes.data.agreement
    assert.equal(v1.version, 1)
    assert.equal(v1.status, 'proposed')
    assert.equal(v1.client_approved_at, null)
    assert.equal(v1.gardener_approved_at, null)
    assert.equal(propRes.data.confirmed, false)
    assert.equal(propRes.data.booking, null)

    // 2. Client A approves v1 (unilateral approval) -> must NOT create a booking!
    const clientAppV1 = await apiRequest(`/agreements/${v1.id}/approve`, {
      method: 'POST',
      cookie: clientACookie,
      body: { version: 1 },
    })
    assert.equal(clientAppV1.status, 200)
    assert.equal(clientAppV1.data.confirmed, false)
    assert.equal(clientAppV1.data.booking, null)
    assert.ok(clientAppV1.data.agreement.client_approved_at)
    assert.equal(clientAppV1.data.agreement.gardener_approved_at, null)
    assert.equal(clientAppV1.data.agreement.status, 'proposed')

    const [[bCountAfterOne]] = await pool.execute(
      'SELECT COUNT(*) AS cnt FROM bookings WHERE inquiry_id = ?',
      [inquiryId],
    )
    assert.equal(Number(bCountAfterOne.cnt), 0, 'Unilateral approval must never create a booking')

    // Duplicate approval by Client A on v1 is rejected with 409
    const dupClientV1 = await apiRequest(`/agreements/${v1.id}/approve`, {
      method: 'POST',
      cookie: clientACookie,
      body: { version: 1 },
    })
    assert.equal(dupClientV1.status, 409)

    // 3. Gardener 1 edits v1 -> creates v2, supersedes v1, and RESETS BOTH PARTIES' APPROVALS!
    const editRes = await apiRequest(`/agreements/${v1.id}`, {
      method: 'PUT',
      cookie: gardener1Cookie,
      body: {
        expectedVersion: 1,
        scopeOfWork: 'Revised scope v2: Trim hedges + haul away branches',
        amount: 2500,
        priceBasis: 'fixed project',
        scheduledStart: '2027-01-15T08:00',
        scheduledEnd: '2027-01-15T13:00',
        location: '123 Calle Real, Tetuan, Zamboanga City',
        conditions: 'Hauling fee included in revised price',
      },
    })
    assert.equal(editRes.status, 200)
    const v2 = editRes.data.agreement
    assert.notEqual(v2.id, v1.id, 'Editing must insert a new agreement row rather than overwrite v1')
    assert.equal(v2.version, 2)
    assert.equal(v2.previous_agreement_id, v1.id)
    assert.equal(v2.status, 'proposed')
    assert.equal(v2.client_approved_at, null, 'Client approval must be reset to NULL on v2')
    assert.equal(v2.gardener_approved_at, null, 'Gardener approval must be reset to NULL on v2')

    // Verify v1 is preserved in DB with status='superseded' and its original scope/price intact
    const [[v1Db]] = await pool.execute('SELECT * FROM agreements WHERE id = ?', [v1.id])
    assert.equal(v1Db.status, 'superseded')
    assert.equal(Number(v1Db.amount), 2200)
    assert.ok(v1Db.client_approved_at, 'Historical approval timestamp on superseded v1 is preserved')

    // 4. Stale approval prevention:
    // 4a. Gardener trying to approve superseded v1 row ID -> 409
    const staleByOldId = await apiRequest(`/agreements/${v1.id}/approve`, {
      method: 'POST',
      cookie: gardener1Cookie,
      body: { version: 1 },
    })
    assert.equal(staleByOldId.status, 409)
    assert.match(staleByOldId.data.message, /Stale agreement version/i)

    // 4b. Gardener trying to approve v2 row ID while passing stale version: 1 -> 409
    const staleByVersionNum = await apiRequest(`/agreements/${v2.id}/approve`, {
      method: 'POST',
      cookie: gardener1Cookie,
      body: { version: 1 },
    })
    assert.equal(staleByVersionNum.status, 409)
    assert.match(staleByVersionNum.data.message, /Stale agreement version/i)

    // 4c. Missing version number -> 400
    const missingVer = await apiRequest(`/agreements/${v2.id}/approve`, {
      method: 'POST',
      cookie: gardener1Cookie,
      body: {},
    })
    assert.equal(missingVer.status, 400)

    // 5. Gardener 1 approves v2 (1st approval on v2) -> still proposed, 0 bookings
    const g1AppV2 = await apiRequest(`/agreements/${v2.id}/approve`, {
      method: 'POST',
      cookie: gardener1Cookie,
      body: { version: 2 },
    })
    assert.equal(g1AppV2.status, 200)
    assert.equal(g1AppV2.data.confirmed, false)
    assert.equal(g1AppV2.data.booking, null)

    // 6. Client A approves v2 (2nd approval on v2) -> Agreement confirmed + 1 booking created!
    const cAAppV2 = await apiRequest(`/agreements/${v2.id}/approve`, {
      method: 'POST',
      cookie: clientACookie,
      body: { version: 2 },
    })
    assert.equal(cAAppV2.status, 200)
    assert.equal(cAAppV2.data.confirmed, true)
    assert.equal(cAAppV2.data.agreement.status, 'agreed')
    assert.ok(cAAppV2.data.agreement.client_approved_at)
    assert.ok(cAAppV2.data.agreement.gardener_approved_at)
    assert.ok(cAAppV2.data.booking.id)
    assert.equal(cAAppV2.data.booking.agreement_id, v2.id)
    assert.equal(cAAppV2.data.booking.status, 'accepted')

    // Verify inquiry status is 'confirmed' and competing quotation2 was declined automatically
    const [[inqRow]] = await pool.execute('SELECT status, gardener_id FROM inquiries WHERE id = ?', [inquiryId])
    assert.equal(inqRow.status, 'confirmed')
    assert.equal(inqRow.gardener_id, gardener1Id)

    const [[q2Row]] = await pool.execute('SELECT status FROM quotations WHERE id = ?', [quotation2Id])
    assert.equal(q2Row.status, 'declined', 'Other open offers must be declined when agreement is confirmed')

    // 7. Editing or cancelling an already confirmed ('agreed') agreement is rejected with 409
    const editConfirmed = await apiRequest(`/agreements/${v2.id}`, {
      method: 'PUT',
      cookie: clientACookie,
      body: {
        scopeOfWork: 'Attempt to change after confirmation',
        amount: 100,
        scheduledStart: '2027-01-15T08:00',
        scheduledEnd: '2027-01-15T12:00',
        location: 'Tetuan',
      },
    })
    assert.equal(editConfirmed.status, 409)

    const cancelConfirmed = await apiRequest(`/agreements/${v2.id}/cancel`, {
      method: 'POST',
      cookie: clientACookie,
    })
    assert.equal(cancelConfirmed.status, 409)
  })

  test('R3-06: Authorization and history visibility (owning client, selected gardener, and admin only)', async () => {
    const { inquiryId } = await createHelperInquiryWithOffers({ general: true })

    const prop = await apiRequest(`/inquiries/${inquiryId}/agreements`, {
      method: 'POST',
      cookie: clientACookie,
      body: {
        scopeOfWork: 'Private agreement scope',
        amount: 2200,
        scheduledStart: '2027-01-20T09:00',
        scheduledEnd: '2027-01-20T11:00',
        location: 'Secret exact house number 42, Tetuan',
      },
    })
    assert.equal(prop.status, 201)
    const agId = prop.data.agreement.id

    // Client A (owner), Gardener 1 (selected provider), and Admin can view -> 200
    for (const allowedCookie of [clientACookie, gardener1Cookie, adminCookie]) {
      const getRes = await apiRequest(`/agreements/${agId}`, { cookie: allowedCookie })
      assert.equal(getRes.status, 200)
      const listRes = await apiRequest(`/inquiries/${inquiryId}/agreements`, { cookie: allowedCookie })
      assert.equal(listRes.status, 200)
    }

    // Gardener 2 (submitted competing offer on the inquiry, but is NOT party to the agreement) -> 403!
    assert.equal((await apiRequest(`/agreements/${agId}`, { cookie: gardener2Cookie })).status, 403)
    assert.equal((await apiRequest(`/inquiries/${inquiryId}/agreements`, { cookie: gardener2Cookie })).status, 403)
    assert.equal((await apiRequest(`/agreements/${agId}/approve`, { method: 'POST', cookie: gardener2Cookie, body: { version: 1 } })).status, 403)
    assert.equal((await apiRequest(`/agreements/${agId}/cancel`, { method: 'POST', cookie: gardener2Cookie })).status, 403)

    // Client B (unrelated client) -> 403!
    assert.equal((await apiRequest(`/agreements/${agId}`, { cookie: clientBCookie })).status, 403)
  })

  test('R3-07: True Concurrency Verification (Promise.all) – simultaneous approvals, duplicate retries, and concurrent edit vs. approve race', async () => {
    // --- Subtest 7A: Simultaneous client + gardener approvals + duplicate retries (4 concurrent requests) ---
    const { inquiryId: inqA, quotation1Id: qA } = await createHelperInquiryWithOffers()
    const propA = await apiRequest(`/inquiries/${inqA}/agreements`, {
      method: 'POST',
      cookie: clientACookie,
      body: {
        quotationId: qA,
        scopeOfWork: 'Concurrent approval test A',
        amount: 2200,
        scheduledStart: '2027-02-01T08:00',
        scheduledEnd: '2027-02-01T11:00',
        location: 'Pasonanca, Zamboanga City',
      },
    })
    assert.equal(propA.status, 201)
    const agAId = propA.data.agreement.id

    // Fire 4 concurrent approval requests simultaneously (2 from Client A + 2 from Gardener 1)
    const concurrentResults = await Promise.all([
      apiRequest(`/agreements/${agAId}/approve`, { method: 'POST', cookie: clientACookie, body: { version: 1 } }),
      apiRequest(`/agreements/${agAId}/approve`, { method: 'POST', cookie: gardener1Cookie, body: { version: 1 } }),
      apiRequest(`/agreements/${agAId}/approve`, { method: 'POST', cookie: clientACookie, body: { version: 1 } }),
      apiRequest(`/agreements/${agAId}/approve`, { method: 'POST', cookie: gardener1Cookie, body: { version: 1 } }),
    ])

    const successes = concurrentResults.filter((r) => r.status === 200)
    const conflicts = concurrentResults.filter((r) => r.status === 409)
    assert.equal(successes.length, 2, 'Exactly 2 approvals (1 client + 1 gardener) must succeed')
    assert.equal(conflicts.length, 2, 'The 2 duplicate concurrent retries must fail with 409')
    assert.equal(successes.filter((r) => r.data.confirmed === true).length, 1, 'Exactly 1 response must report confirmed=true')
    assert.equal(successes.filter((r) => r.data.confirmed === false).length, 1, 'Exactly 1 response must report confirmed=false')

    const [bookingsA] = await pool.execute('SELECT * FROM bookings WHERE inquiry_id = ?', [inqA])
    assert.equal(bookingsA.length, 1, 'Concurrent approvals must produce at most ONE booking')
    assert.equal(bookingsA[0].agreement_id, agAId)

    // --- Subtest 7B: Concurrent Edit (v1 -> v2) racing against Approve (version: 1) ---
    const { inquiryId: inqB, quotation1Id: qB } = await createHelperInquiryWithOffers()
    const propB = await apiRequest(`/inquiries/${inqB}/agreements`, {
      method: 'POST',
      cookie: clientACookie,
      body: {
        quotationId: qB,
        scopeOfWork: 'Race edit vs approve v1',
        amount: 2200,
        scheduledStart: '2027-02-03T08:00',
        scheduledEnd: '2027-02-03T11:00',
        location: 'Pasonanca, Zamboanga City',
      },
    })
    assert.equal(propB.status, 201)
    const agBId = propB.data.agreement.id

    // Client A approves v1 first so v1 already has 1 approval.
    // Now Gardener 1's approval of v1 AND Client A's edit of v1->v2 fire simultaneously:
    await apiRequest(`/agreements/${agBId}/approve`, {
      method: 'POST',
      cookie: clientACookie,
      body: { version: 1 },
    })

    // Fire Edit (Client A -> v2) and Approve (Gardener 1 -> v1) concurrently, with edit initiated first on event loop
    const [editOutcome, approveOutcome] = await Promise.all([
      apiRequest(`/agreements/${agBId}`, {
        method: 'PUT',
        cookie: clientACookie,
        body: {
          expectedVersion: 1,
          scopeOfWork: 'Edited scope v2 during race',
          amount: 2600,
          scheduledStart: '2027-02-03T08:00',
          scheduledEnd: '2027-02-03T12:00',
          location: 'Pasonanca, Zamboanga City',
        },
      }),
      apiRequest(`/agreements/${agBId}/approve`, {
        method: 'POST',
        cookie: gardener1Cookie,
        body: { version: 1 },
      }),
    ])

    // Because both serialize on the inquiry lock, they CANNOT both succeed on v1!
    // Either edit succeeded (200) and approve v1 failed (409 stale), OR approve v1 succeeded (200 confirmed) and edit failed (409 locked).
    assert.equal(
      (editOutcome.status === 200 && approveOutcome.status === 409)
        || (approveOutcome.status === 200 && editOutcome.status === 409),
      true,
      `Expected serialized mutual exclusion, got edit=${editOutcome.status}, approve=${approveOutcome.status}`,
    )

    // --- Subtest 7C: Concurrent duplicate proposals on the same inquiry ---
    const { inquiryId: inqC, quotation1Id: qC } = await createHelperInquiryWithOffers()
    const [propC1, propC2] = await Promise.all([
      apiRequest(`/inquiries/${inqC}/agreements`, {
        method: 'POST',
        cookie: clientACookie,
        body: {
          quotationId: qC,
          scopeOfWork: 'Concurrent proposal 1',
          amount: 2000,
          scheduledStart: '2027-02-05T08:00',
          scheduledEnd: '2027-02-05T10:00',
          location: 'Tetuan',
        },
      }),
      apiRequest(`/inquiries/${inqC}/agreements`, {
        method: 'POST',
        cookie: gardener1Cookie,
        body: {
          quotationId: qC,
          scopeOfWork: 'Concurrent proposal 2',
          amount: 2100,
          scheduledStart: '2027-02-05T08:00',
          scheduledEnd: '2027-02-05T10:00',
          location: 'Tetuan',
        },
      }),
    ])
    const cStatuses = [propC1.status, propC2.status].sort()
    assert.deepEqual(cStatuses, [201, 409], 'Concurrent proposals on the same inquiry must allow 1 (201) and reject the other (409)')
  })

  test('R3-08: Transactional Rollback Verification on mid-transaction failure and schedule conflict at confirmation', async () => {
    const { inquiryId, quotation1Id } = await createHelperInquiryWithOffers()

    const prop = await apiRequest(`/inquiries/${inquiryId}/agreements`, {
      method: 'POST',
      cookie: clientACookie,
      body: {
        quotationId: quotation1Id,
        scopeOfWork: 'Rollback test scope',
        amount: 2200,
        scheduledStart: '2027-02-10T08:00',
        scheduledEnd: '2027-02-10T11:00',
        location: 'Tetuan, Zamboanga City',
      },
    })
    assert.equal(prop.status, 201)
    const agId = prop.data.agreement.id

    // Client A approves v1 (1st approval)
    const cApp = await apiRequest(`/agreements/${agId}/approve`, {
      method: 'POST',
      cookie: clientACookie,
      body: { version: 1 },
    })
    assert.equal(cApp.status, 200)

    // 1. Inject a mid-transaction error right AFTER `UPDATE agreements SET status = 'agreed'`
    //    and BEFORE `INSERT INTO bookings` to prove full atomic rollback!
    approveAgreement._testBeforeBookingHook = async () => {
      throw new Error('SIMULATED_MID_TRANSACTION_FAILURE')
    }

    const failedApprove = await apiRequest(`/agreements/${agId}/approve`, {
      method: 'POST',
      cookie: gardener1Cookie,
      body: { version: 1 },
    })
    assert.equal(failedApprove.status, 500)
    approveAgreement._testBeforeBookingHook = null

    // Verify in MySQL that the transaction rolled back completely:
    // - agreement is still 'proposed'
    // - gardener_approved_at is still NULL
    // - inquiry is still 'in_agreement'
    // - 0 bookings exist for this inquiry/agreement
    const [[agAfterFail]] = await pool.execute('SELECT * FROM agreements WHERE id = ?', [agId])
    assert.equal(agAfterFail.status, 'proposed', 'Agreement status must roll back to proposed')
    assert.equal(agAfterFail.gardener_approved_at, null, 'Second approval timestamp must roll back to NULL')
    assert.ok(agAfterFail.client_approved_at, 'First approval timestamp remains intact')

    const [[inqAfterFail]] = await pool.execute('SELECT status FROM inquiries WHERE id = ?', [inquiryId])
    assert.equal(inqAfterFail.status, 'in_agreement')

    const [bookingsAfterFail] = await pool.execute('SELECT id FROM bookings WHERE agreement_id = ?', [agId])
    assert.equal(bookingsAfterFail.length, 0, 'Zero bookings may exist after rolled-back approval')

    // 2. Now insert a conflicting accepted booking for Gardener 1 during 2027-02-10 09:00–10:00
    const [confBooking] = await pool.execute(
      `INSERT INTO bookings (client_id, gardener_id, scheduled_start, scheduled_end, location, status)
       VALUES (?, ?, '2027-02-10 09:00:00', '2027-02-10 10:00:00', 'Other Site', 'accepted')`,
      [clientBId, gardener1Id],
    )

    // Gardener 1 tries to approve v1 now -> rejected with 409 due to schedule conflict, and rolled back!
    const conflictApprove = await apiRequest(`/agreements/${agId}/approve`, {
      method: 'POST',
      cookie: gardener1Cookie,
      body: { version: 1 },
    })
    assert.equal(conflictApprove.status, 409)
    assert.match(conflictApprove.data.message, /already has an accepted booking/i)

    const [[agAfterConflict]] = await pool.execute('SELECT status, gardener_approved_at FROM agreements WHERE id = ?', [agId])
    assert.equal(agAfterConflict.status, 'proposed')
    assert.equal(agAfterConflict.gardener_approved_at, null)

    // Remove conflicting booking, then Gardener 1 approves v1 -> now succeeds cleanly!
    await pool.execute('DELETE FROM bookings WHERE id = ?', [confBooking.insertId])
    const okApprove = await apiRequest(`/agreements/${agId}/approve`, {
      method: 'POST',
      cookie: gardener1Cookie,
      body: { version: 1 },
    })
    assert.equal(okApprove.status, 200)
    assert.equal(okApprove.data.confirmed, true)
    assert.ok(okApprove.data.booking.id)
  })
})
