const path = require('node:path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true })

// Target the isolated test database so the original working database remains untouched
process.env.DB_NAME = process.env.TEST_DB_NAME || 'hugatiera_db_migration_test'

const assert = require('node:assert/strict')
const http = require('node:http')
const { after, before, describe, test } = require('node:test')
const bcrypt = require('bcryptjs')
const app = require('../app')
const { pool } = require('../config/database')

let server
let baseUrl
const createdUserIds = []
const createdCategoryIds = []

function extractCookie(response) {
  const raw = response.headers.get('set-cookie')
  if (!raw) return ''
  return raw.split(';')[0]
}

async function apiRequest(path, { method = 'GET', body, cookie = '', headers = {} } = {}) {
  const requestHeaders = { ...headers }
  if (cookie) requestHeaders.Cookie = cookie

  let payload = body
  if (body && !(body instanceof FormData) && typeof body === 'object') {
    requestHeaders['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }

  const response = await fetch(`${baseUrl}${path}`, {
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

describe('HugaTiera Phase 15 System Integration & Regression Suite', () => {
  const runId = Date.now()
  let clientCookie = ''
  let gardenerCookie = ''
  let adminCookie = ''
  let clientId = null
  let gardenerId = null
  let adminId = null
  let categoryId = null
  let pricedServiceId = null
  let unpricedServiceId = null
  let portfolioId = null
  let inquiryId = null
  let quotationId = null
  let inquiryBookingId = null
  let directBookingId = null
  let conversationId = null
  let directConversationId = null
  let reportId = null

  before(async () => {
    const [[dbRow]] = await pool.query('SELECT DATABASE() AS db')
    assert.equal(
      dbRow.db,
      'hugatiera_db_migration_test',
      `Refusing to run integration tests on ${dbRow.db}; must be hugatiera_db_migration_test`,
    )

    server = http.createServer(app)
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const { port } = server.address()
    baseUrl = `http://127.0.0.1:${port}/api`

    // Seed a temporary administrator account directly in MySQL (since public admin registration is blocked)
    const adminEmail = `phase15.admin.${runId}@hugatiera.local`
    const passwordHash = await bcrypt.hash('AdminPass123!', 10)
    const [result] = await pool.execute(
      "INSERT INTO users (email, password_hash, role, first_name, last_name) VALUES (?, ?, 'administrator', 'Phase15', 'Admin')",
      [adminEmail, passwordHash],
    )
    adminId = result.insertId
    createdUserIds.push(adminId)

    const loginRes = await apiRequest('/auth/login', {
      method: 'POST',
      body: { email: adminEmail, password: 'AdminPass123!' },
    })
    assert.equal(loginRes.status, 200)
    adminCookie = loginRes.cookie

    const [categories] = await pool.execute('SELECT id FROM service_categories WHERE is_active = TRUE LIMIT 1')
    categoryId = categories[0].id
  })

  after(async () => {
    if (createdUserIds.length > 0) {
      const placeholders = createdUserIds.map(() => '?').join(',')
      await pool.execute(`DELETE FROM reports WHERE reporter_id IN (${placeholders}) OR reported_user_id IN (${placeholders})`, [...createdUserIds, ...createdUserIds])
      await pool.execute(`DELETE FROM reviews WHERE client_id IN (${placeholders}) OR gardener_id IN (${placeholders})`, [...createdUserIds, ...createdUserIds])
      await pool.execute(`DELETE FROM bookings WHERE client_id IN (${placeholders}) OR gardener_id IN (${placeholders})`, [...createdUserIds, ...createdUserIds])
      await pool.execute(`DELETE FROM agreements WHERE client_id IN (${placeholders}) OR gardener_id IN (${placeholders})`, [...createdUserIds, ...createdUserIds])
      await pool.execute(`DELETE FROM conversations WHERE client_id IN (${placeholders}) OR gardener_id IN (${placeholders})`, [...createdUserIds, ...createdUserIds])
      await pool.execute(`DELETE FROM inquiries WHERE client_id IN (${placeholders}) OR gardener_id IN (${placeholders})`, [...createdUserIds, ...createdUserIds])
      await pool.execute(`DELETE FROM users WHERE id IN (${placeholders})`, createdUserIds)
    }
    if (createdCategoryIds.length > 0) {
      const placeholders = createdCategoryIds.map(() => '?').join(',')
      await pool.execute(`DELETE FROM service_categories WHERE id IN (${placeholders})`, createdCategoryIds)
    }
    if (server) {
      await new Promise((resolve) => server.close(resolve))
    }
    await pool.end()
  })

  test('TC-01: Health check confirms Express and MySQL connectivity', async () => {
    const res = await apiRequest('/health')
    assert.equal(res.status, 200)
    assert.equal(res.data.status, 'ok')
    assert.equal(res.data.database, 'connected')
  })

  test('TC-02: Registration, login, duplicate prevention, and public admin block', async () => {
    const adminAttempt = await apiRequest('/auth/register', {
      method: 'POST',
      body: {
        firstName: 'Fake',
        lastName: 'Admin',
        email: `fake.admin.${runId}@hugatiera.local`,
        password: 'Password123!',
        role: 'administrator',
      },
    })
    assert.equal(adminAttempt.status, 400)

    const clientReg = await apiRequest('/auth/register', {
      method: 'POST',
      body: {
        firstName: 'Maria',
        lastName: 'Santos',
        email: `client.${runId}@hugatiera.local`,
        password: 'Password123!',
        role: 'client',
      },
    })
    assert.equal(clientReg.status, 201)
    assert.equal(clientReg.data.user.role, 'client')
    clientCookie = clientReg.cookie
    clientId = clientReg.data.user.id
    createdUserIds.push(clientId)

    const duplicateReg = await apiRequest('/auth/register', {
      method: 'POST',
      body: {
        firstName: 'Maria',
        lastName: 'Santos',
        email: `client.${runId}@hugatiera.local`,
        password: 'Password123!',
        role: 'client',
      },
    })
    assert.equal(duplicateReg.status, 409)

    const gardenerReg = await apiRequest('/auth/register', {
      method: 'POST',
      body: {
        firstName: 'Ramon',
        lastName: 'Verde',
        email: `gardener.${runId}@hugatiera.local`,
        password: 'Password123!',
        role: 'gardener',
      },
    })
    assert.equal(gardenerReg.status, 201)
    assert.equal(gardenerReg.data.user.role, 'gardener')
    gardenerCookie = gardenerReg.cookie
    gardenerId = gardenerReg.data.user.id
    createdUserIds.push(gardenerId)

    const meRes = await apiRequest('/auth/me', { cookie: clientCookie })
    assert.equal(meRes.status, 200)
    assert.equal(meRes.data.user.id, clientId)
  })

  test('TC-03: Role-based authorization blocks unauthorized access', async () => {
    const unauth = await apiRequest('/profiles/me')
    assert.equal(unauth.status, 401)

    const clientAdminAttempt = await apiRequest('/admin/summary', { cookie: clientCookie })
    assert.equal(clientAdminAttempt.status, 403)

    const clientServiceAttempt = await apiRequest('/services', {
      method: 'POST',
      cookie: clientCookie,
      body: { title: 'Unauthorized', description: 'Test', categoryId },
    })
    assert.equal(clientServiceAttempt.status, 403)
  })

  test('TC-04: Client and Gardener profile retrieval and updates', async () => {
    const updateClient = await apiRequest('/profiles/me', {
      method: 'PUT',
      cookie: clientCookie,
      body: {
        firstName: 'Maria',
        lastName: 'Santos',
        phone: '09171234567',
        address: 'Tetuan',
        city: 'Zamboanga City',
        bio: 'Homeowner looking for garden maintenance.',
      },
    })
    assert.equal(updateClient.status, 200)
    assert.equal(updateClient.data.profile.address, 'Tetuan')

    const updateGardener = await apiRequest('/profiles/me', {
      method: 'PUT',
      cookie: gardenerCookie,
      body: {
        firstName: 'Ramon',
        lastName: 'Verde',
        phone: '09187654321',
        businessName: 'Verde Zamboanga Gardens',
        serviceArea: 'Zamboanga City',
        yearsOfExperience: 6,
        description: 'Tropical landscaping and maintenance specialist.',
      },
    })
    assert.equal(updateGardener.status, 200)
    assert.equal(updateGardener.data.profile.business_name, 'Verde Zamboanga Gardens')
    assert.equal(Boolean(updateGardener.data.profile.is_approved), false)
  })

  test('TC-05 & TC-06: Unapproved gardener services remain hidden and block direct booking', async () => {
    const createPriced = await apiRequest('/services', {
      method: 'POST',
      cookie: gardenerCookie,
      body: {
        title: `Tropical Lawn Care ${runId}`,
        description: 'Complete mowing, edging, and cleanup.',
        categoryId,
        indicativePrice: 1200,
        priceUnit: 'per visit',
        serviceArea: 'Zamboanga City',
      },
    })
    assert.equal(createPriced.status, 201)
    pricedServiceId = createPriced.data.id

    const createUnpriced = await apiRequest('/services', {
      method: 'POST',
      cookie: gardenerCookie,
      body: {
        title: `Custom Landscape Design ${runId}`,
        description: 'Bespoke garden layout requiring site quotation.',
        categoryId,
        indicativePrice: null,
        priceUnit: 'per project',
        serviceArea: 'Zamboanga City',
      },
    })
    assert.equal(createUnpriced.status, 201)
    unpricedServiceId = createUnpriced.data.id

    const publicDetailBeforeApproval = await apiRequest(`/services/${pricedServiceId}`)
    assert.equal(publicDetailBeforeApproval.status, 404)

    const unapprovedDirectBooking = await apiRequest('/agreements/direct-service', {
      method: 'POST',
      cookie: clientCookie,
      body: {
        serviceId: pricedServiceId,
        scheduledStart: '2026-12-01T09:00',
        scheduledEnd: '2026-12-01T11:00',
        location: 'Tetuan, Zamboanga City',
      },
    })
    assert.equal(unapprovedDirectBooking.status, 409)
  })

  test('TC-07 & TC-08: Administrator approves gardener and marketplace search exposes services', async () => {
    const pendingRes = await apiRequest('/admin/gardeners/pending', { cookie: adminCookie })
    assert.equal(pendingRes.status, 200)
    assert.ok(pendingRes.data.gardeners.some((g) => g.id === gardenerId))

    const approveRes = await apiRequest(`/admin/gardeners/${gardenerId}/approval`, {
      method: 'PATCH',
      cookie: adminCookie,
      body: { isApproved: true },
    })
    assert.equal(approveRes.status, 200)
    assert.equal(approveRes.data.isApproved, true)

    const searchRes = await apiRequest(`/services?keyword=${encodeURIComponent(String(runId))}&categoryId=${categoryId}`)
    assert.equal(searchRes.status, 200)
    assert.equal(searchRes.data.services.length, 2)
  })

  test('TC-09: Portfolio upload, metadata update, delivery, and deletion', async () => {
    const pngBytes = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    )
    const form = new FormData()
    form.append('title', 'Pasonanca Terrace Project')
    form.append('description', 'Completed terrace planters.')
    form.append('image', new Blob([pngBytes], { type: 'image/png' }), 'terrace.png')

    const uploadRes = await apiRequest('/portfolios', {
      method: 'POST',
      cookie: gardenerCookie,
      body: form,
    })
    assert.equal(uploadRes.status, 201)
    portfolioId = uploadRes.data.id

    const updateRes = await apiRequest(`/portfolios/${portfolioId}`, {
      method: 'PUT',
      cookie: gardenerCookie,
      body: { title: 'Updated Terrace Project', description: 'Updated description.' },
    })
    assert.equal(updateRes.status, 200)

    const imageRes = await fetch(`${baseUrl}/portfolios/${portfolioId}/image`)
    assert.equal(imageRes.status, 200)

    const gardenerProfileRes = await apiRequest(`/gardeners/${gardenerId}`)
    assert.equal(gardenerProfileRes.status, 200)
    assert.equal(gardenerProfileRes.data.portfolios[0].title, 'Updated Terrace Project')

    const deleteRes = await apiRequest(`/portfolios/${portfolioId}`, {
      method: 'DELETE',
      cookie: gardenerCookie,
    })
    assert.equal(deleteRes.status, 204)
  })

  test('TC-10 & TC-11: Inquiry -> Quotation -> Booking lifecycle and conflict prevention', async () => {
    const inquiryRes = await apiRequest('/inquiries', {
      method: 'POST',
      cookie: clientCookie,
      body: {
        serviceId: unpricedServiceId,
        subject: 'Front yard redesign inquiry',
        description: 'Need tropical shrubs and stone pathway.',
        requestedDate: '2026-12-05',
        location: 'Tetuan, Zamboanga City',
      },
    })
    assert.equal(inquiryRes.status, 201)
    inquiryId = inquiryRes.data.id

    const quoteRes = await apiRequest(`/inquiries/${inquiryId}/quotations`, {
      method: 'POST',
      cookie: gardenerCookie,
      body: {
        amount: 4500,
        details: 'Includes shrub planting, soil prep, and stepping stones.',
        availabilityStart: '2026-12-05',
        availabilityEnd: '2026-12-10',
        validUntil: '2026-12-04',
      },
    })
    assert.equal(quoteRes.status, 201)
    quotationId = quoteRes.data.id

    const acceptQuoteRes = await apiRequest(`/inquiries/quotations/${quotationId}/status`, {
      method: 'PATCH',
      cookie: clientCookie,
      body: { status: 'accepted' },
    })
    assert.equal(acceptQuoteRes.status, 200)

    // Direct booking creation bypassing mutual agreement is blocked (409)
    const bypassedBookingRes = await apiRequest('/bookings', {
      method: 'POST',
      cookie: clientCookie,
      body: {
        quotationId,
        scheduledStart: '2026-12-06T08:00',
        scheduledEnd: '2026-12-06T12:00',
        location: 'Tetuan, Zamboanga City',
        notes: 'Gate code available upon arrival.',
      },
    })
    assert.equal(bypassedBookingRes.status, 409)

    // Propose mutual agreement v1 on the inquiry
    const proposeRes = await apiRequest(`/inquiries/${inquiryId}/agreements`, {
      method: 'POST',
      cookie: clientCookie,
      body: {
        quotationId,
        scopeOfWork: 'Includes shrub planting, soil prep, and stepping stones.',
        amount: 4500,
        priceBasis: 'fixed project',
        scheduledStart: '2026-12-06T08:00',
        scheduledEnd: '2026-12-06T12:00',
        location: 'Tetuan, Zamboanga City',
        conditions: 'Gate code available upon arrival.',
      },
    })
    assert.equal(proposeRes.status, 201)
    assert.equal(proposeRes.data.confirmed, false)
    assert.equal(proposeRes.data.booking, null)
    const agreementId = proposeRes.data.agreement.id

    // Client approves v1 -> still not confirmed (only 1 party approved)
    const clientApproveRes = await apiRequest(`/agreements/${agreementId}/approve`, {
      method: 'POST',
      cookie: clientCookie,
      body: { version: 1 },
    })
    assert.equal(clientApproveRes.status, 200)
    assert.equal(clientApproveRes.data.confirmed, false)
    assert.equal(clientApproveRes.data.booking, null)

    // Gardener approves v1 -> both parties approved v1 -> confirmed booking created automatically!
    const gardenerApproveRes = await apiRequest(`/agreements/${agreementId}/approve`, {
      method: 'POST',
      cookie: gardenerCookie,
      body: { version: 1 },
    })
    assert.equal(gardenerApproveRes.status, 200)
    assert.equal(gardenerApproveRes.data.confirmed, true)
    assert.ok(gardenerApproveRes.data.booking.id)
    assert.equal(gardenerApproveRes.data.booking.status, 'accepted')
    assert.equal(gardenerApproveRes.data.booking.agreement_id, agreementId)
    inquiryBookingId = gardenerApproveRes.data.booking.id

    // Duplicate agreement proposal on a confirmed request must be rejected
    const duplicateProposal = await apiRequest(`/inquiries/${inquiryId}/agreements`, {
      method: 'POST',
      cookie: clientCookie,
      body: {
        quotationId,
        scopeOfWork: 'Another attempt',
        amount: 4500,
        scheduledStart: '2026-12-07T08:00',
        scheduledEnd: '2026-12-07T12:00',
        location: 'Tetuan, Zamboanga City',
      },
    })
    assert.equal(duplicateProposal.status, 409)

    // Overlapping schedule conflict check via priced service agreement proposal
    const conflictBooking = await apiRequest('/agreements/direct-service', {
      method: 'POST',
      cookie: clientCookie,
      body: {
        serviceId: pricedServiceId,
        scheduledStart: '2026-12-06T10:00',
        scheduledEnd: '2026-12-06T13:00',
        location: 'Tetuan, Zamboanga City',
      },
    })
    assert.equal(conflictBooking.status, 409)

    // Gardener transitions confirmed booking: accepted -> in_progress -> completed
    for (const nextStatus of ['in_progress', 'completed']) {
      const statusRes = await apiRequest(`/bookings/${inquiryBookingId}/status`, {
        method: 'PATCH',
        cookie: gardenerCookie,
        body: { status: nextStatus },
      })
      assert.equal(statusRes.status, 200)
    }
  })

  test('TC-12: Direct priced-service arrangement routed through mutual agreement (R3)', async () => {
    // Gardener (non-client) cannot submit direct service arrangement
    const nonClientAttempt = await apiRequest('/agreements/direct-service', {
      method: 'POST',
      cookie: gardenerCookie,
      body: {
        serviceId: pricedServiceId,
        scheduledStart: '2026-12-08T09:00',
        scheduledEnd: '2026-12-08T11:00',
        location: 'Zamboanga City',
      },
    })
    assert.equal(nonClientAttempt.status, 403)

    // Service without indicative price cannot use direct priced-service arrangement
    const unpricedAttempt = await apiRequest('/agreements/direct-service', {
      method: 'POST',
      cookie: clientCookie,
      body: {
        serviceId: unpricedServiceId,
        scheduledStart: '2026-12-08T09:00',
        scheduledEnd: '2026-12-08T11:00',
        location: 'Zamboanga City',
      },
    })
    assert.equal(unpricedAttempt.status, 409)

    // Eligible approved priced service creates direct inquiry + agreement v1 (not yet a booking)
    const validDirect = await apiRequest('/agreements/direct-service', {
      method: 'POST',
      cookie: clientCookie,
      body: {
        serviceId: pricedServiceId,
        scheduledStart: '2026-12-08T09:00',
        scheduledEnd: '2026-12-08T11:00',
        location: 'Sta. Maria, Zamboanga City',
        notes: 'Direct service arrangement test',
      },
    })
    assert.equal(validDirect.status, 201)
    assert.equal(validDirect.data.confirmed, false)
    assert.equal(validDirect.data.booking, null)
    const directAgId = validDirect.data.agreement.id

    // Both parties approve v1 to confirm the booking
    const cApp = await apiRequest(`/agreements/${directAgId}/approve`, {
      method: 'POST',
      cookie: clientCookie,
      body: { version: 1 },
    })
    assert.equal(cApp.status, 200)
    assert.equal(cApp.data.confirmed, false)

    const gApp = await apiRequest(`/agreements/${directAgId}/approve`, {
      method: 'POST',
      cookie: gardenerCookie,
      body: { version: 1 },
    })
    assert.equal(gApp.status, 200)
    assert.equal(gApp.data.confirmed, true)
    directBookingId = gApp.data.booking.id

    const detailRes = await apiRequest(`/bookings/${directBookingId}`, { cookie: clientCookie })
    assert.equal(detailRes.status, 200)
    assert.equal(detailRes.data.booking.agreement_id, directAgId)
    assert.equal(detailRes.data.booking.status, 'accepted')

    // Deactivated service cannot start a direct arrangement
    await apiRequest(`/services/${pricedServiceId}`, { method: 'DELETE', cookie: gardenerCookie })
    const inactiveAttempt = await apiRequest('/agreements/direct-service', {
      method: 'POST',
      cookie: clientCookie,
      body: {
        serviceId: pricedServiceId,
        scheduledStart: '2026-12-09T09:00',
        scheduledEnd: '2026-12-09T11:00',
        location: 'Zamboanga City',
      },
    })
    assert.equal(inactiveAttempt.status, 409)
  })

  test('TC-13: Conversations (inquiry & direct booking), messages, and notifications', async () => {
    const convRes = await apiRequest('/conversations', {
      method: 'POST',
      cookie: clientCookie,
      body: { inquiryId },
    })
    assert.equal(convRes.status, 201)
    conversationId = convRes.data.id

    const directConvRes = await apiRequest('/conversations', {
      method: 'POST',
      cookie: clientCookie,
      body: { bookingId: directBookingId },
    })
    assert.equal(directConvRes.status, 201)
    directConversationId = directConvRes.data.id
    assert.ok(directConversationId > 0)

    const msgRes = await apiRequest(`/conversations/${conversationId}/messages`, {
      method: 'POST',
      cookie: clientCookie,
      body: { message: 'Hello Ramon, looking forward to the garden work!' },
    })
    assert.equal(msgRes.status, 201)

    const listMsgRes = await apiRequest(`/conversations/${conversationId}/messages`, {
      cookie: gardenerCookie,
    })
    assert.equal(listMsgRes.status, 200)
    assert.equal(listMsgRes.data.messages.length, 1)

    const notifRes = await apiRequest('/notifications', { cookie: gardenerCookie })
    assert.equal(notifRes.status, 200)
    assert.ok(notifRes.data.notifications.length > 0)

    const readAllRes = await apiRequest('/notifications/read-all', {
      method: 'PATCH',
      cookie: gardenerCookie,
    })
    assert.equal(readAllRes.status, 204)
  })

  test('TC-14: Completed booking review creation, duplicate block, and average rating', async () => {
    // Uncompleted booking cannot be reviewed
    const prematureReview = await apiRequest('/reviews', {
      method: 'POST',
      cookie: clientCookie,
      body: { bookingId: directBookingId, rating: 5, reviewText: 'Too early' },
    })
    assert.equal(prematureReview.status, 409)

    // Completed booking can be reviewed once
    const validReview = await apiRequest('/reviews', {
      method: 'POST',
      cookie: clientCookie,
      body: { bookingId: inquiryBookingId, rating: 5, reviewText: 'Excellent tropical garden work!' },
    })
    assert.equal(validReview.status, 201)

    // Duplicate review is rejected
    const duplicateReview = await apiRequest('/reviews', {
      method: 'POST',
      cookie: clientCookie,
      body: { bookingId: inquiryBookingId, rating: 4, reviewText: 'Second review attempt' },
    })
    assert.equal(duplicateReview.status, 409)

    const gardenerRes = await apiRequest(`/gardeners/${gardenerId}`)
    assert.equal(gardenerRes.status, 200)
    assert.equal(gardenerRes.data.gardener.average_rating, 5)
    assert.equal(gardenerRes.data.gardener.review_count, 1)
  })

  test('TC-15: User report submission, admin moderation, and immediate user deactivation enforcement', async () => {
    const selfReport = await apiRequest('/profiles/reports', {
      method: 'POST',
      cookie: clientCookie,
      body: { reportedUserId: clientId, reason: 'Self report test' },
    })
    assert.equal(selfReport.status, 400)

    const createReportRes = await apiRequest('/profiles/reports', {
      method: 'POST',
      cookie: clientCookie,
      body: {
        reportedUserId: gardenerId,
        reportedServiceId: unpricedServiceId,
        reason: 'Test report for Phase 15 verification',
        details: 'Checking end-to-end report moderation.',
      },
    })
    assert.equal(createReportRes.status, 201)
    reportId = createReportRes.data.id

    const adminReportsRes = await apiRequest('/admin/reports', { cookie: adminCookie })
    assert.equal(adminReportsRes.status, 200)
    assert.ok(adminReportsRes.data.reports.some((r) => r.id === reportId))

    const resolveReportRes = await apiRequest(`/admin/reports/${reportId}`, {
      method: 'PATCH',
      cookie: adminCookie,
      body: { status: 'resolved' },
    })
    assert.equal(resolveReportRes.status, 200)

    const newCatRes = await apiRequest('/admin/categories', {
      method: 'POST',
      cookie: adminCookie,
      body: { name: `Phase15 Category ${runId}`, description: 'Temporary test category' },
    })
    assert.equal(newCatRes.status, 201)
    createdCategoryIds.push(newCatRes.data.id)

    // Deactivate client and verify active session cookie is immediately invalidated
    const deactivateRes = await apiRequest(`/admin/users/${clientId}/status`, {
      method: 'PATCH',
      cookie: adminCookie,
      body: { isActive: false },
    })
    assert.equal(deactivateRes.status, 200)

    const deactivatedMeRes = await apiRequest('/auth/me', { cookie: clientCookie })
    assert.equal(deactivatedMeRes.status, 401)

    // Reactivate client for any remaining checks
    await apiRequest(`/admin/users/${clientId}/status`, {
      method: 'PATCH',
      cookie: adminCookie,
      body: { isActive: true },
    })
  })

  test('TC-16: AI Garden Planning Assistant input validation and authentication checks', async () => {
    const unauthAi = await apiRequest('/ai/garden-plan', {
      method: 'POST',
      body: { input: 'Suggest balcony plants' },
    })
    assert.equal(unauthAi.status, 401)

    const emptyAi = await apiRequest('/ai/garden-plan', {
      method: 'POST',
      cookie: gardenerCookie,
      body: { input: '   ' },
    })
    assert.equal(emptyAi.status, 400)

    const tooLongAi = await apiRequest('/ai/garden-plan', {
      method: 'POST',
      cookie: gardenerCookie,
      body: { input: 'a'.repeat(3001) },
    })
    assert.equal(tooLongAi.status, 400)
  })

  test('TC-17: Phase 2 (ISS-05, ISS-06, ISS-07) — Role-specific profile/dashboard access, Admin booking-route guards, and floating message icon visibility', async () => {
    const profileHelpers = await import('../../frontend/src/services/profiles.js')

    // 1. ISS-05: Client and Gardener profile retrieval, normalization, and updates
    const getClientProfile = await apiRequest('/profiles/me', { cookie: clientCookie })
    assert.equal(getClientProfile.status, 200)
    assert.equal(getClientProfile.data.user.role, 'client')
    const clientForm = profileHelpers.buildProfileForm(getClientProfile.data)
    assert.equal(clientForm.firstName, 'Maria')
    assert.equal(clientForm.lastName, 'Santos')
    assert.equal(clientForm.address, 'Tetuan')
    assert.equal(clientForm.city, 'Zamboanga City')

    const getGardenerProfile = await apiRequest('/profiles/me', { cookie: gardenerCookie })
    assert.equal(getGardenerProfile.status, 200)
    assert.equal(getGardenerProfile.data.user.role, 'gardener')
    const gardenerForm = profileHelpers.buildProfileForm(getGardenerProfile.data)
    assert.equal(gardenerForm.firstName, 'Ramon')
    assert.equal(gardenerForm.lastName, 'Verde')
    assert.equal(gardenerForm.businessName, 'Verde Zamboanga Gardens')
    assert.equal(gardenerForm.serviceArea, 'Zamboanga City')
    assert.equal(gardenerForm.yearsOfExperience, 6)

    // Verify dashboard tab resolution separates overview from profile/settings
    assert.equal(profileHelpers.resolveDashboardTab(null, false), 'overview')
    assert.equal(profileHelpers.resolveDashboardTab('profile', false), 'profile')
    assert.equal(profileHelpers.resolveDashboardTab('settings', false), 'profile')
    assert.equal(profileHelpers.resolveDashboardTab(null, true), 'profile')

    // Verify existing profile update still persists and returns updated fields
    const updatedClientProfile = await apiRequest('/profiles/me', {
      method: 'PUT',
      cookie: clientCookie,
      body: {
        firstName: 'Maria',
        lastName: 'Santos',
        phone: '09171234568',
        address: 'Pasonanca',
        city: 'Zamboanga City',
        bio: 'Updated bio from dedicated profile settings tab.',
      },
    })
    assert.equal(updatedClientProfile.status, 200)
    assert.equal(updatedClientProfile.data.user.phone, '09171234568')
    assert.equal(updatedClientProfile.data.profile.address, 'Pasonanca')
    assert.equal(updatedClientProfile.data.profile.bio, 'Updated bio from dedicated profile settings tab.')

    // 2. ISS-06: Admin navigation and booking-route authorization behavior
    const adminNav = profileHelpers.getDashboardNavLinks('administrator')
    assert.ok(adminNav.some((item) => item.label === 'Overview' && item.to === '/dashboard'))
    assert.ok(adminNav.some((item) => item.label === 'Approvals' && item.href === '#admin-approvals'))
    assert.ok(adminNav.some((item) => item.label === 'Activity' && item.href === '#admin-activity'))
    assert.ok(adminNav.some((item) => item.label === 'Reports' && item.href === '#admin-reports'))
    assert.ok(adminNav.some((item) => item.label === 'Accounts' && item.href === '#admin-accounts'))
    assert.equal(adminNav.some((item) => item.to === '/bookings' || item.to === '/inquiries' || item.to === '/messages' || item.to === '/dashboard?tab=profile'), false)

    for (const role of ['client', 'gardener']) {
      const userNav = profileHelpers.getDashboardNavLinks(role, { inquiries: 2, messages: 1, bookings: 3 })
      assert.ok(userNav.some((item) => item.to === '/dashboard' && item.label === 'Overview'))
      assert.ok(userNav.some((item) => item.to === '/inquiries' && item.badge === 2))
      assert.ok(userNav.some((item) => item.to === '/messages' && item.badge === 1))
      assert.ok(userNav.some((item) => item.to === '/bookings' && item.badge === 3))
      assert.ok(userNav.some((item) => item.to === '/dashboard?tab=profile' && item.label === 'Profile'))
    }

    // Admin requests to personal /api/bookings and /api/inquiries endpoints are explicitly denied (403)
    const adminListBookings = await apiRequest('/bookings', { cookie: adminCookie })
    assert.equal(adminListBookings.status, 403)

    const adminGetBooking = await apiRequest(`/bookings/${inquiryBookingId}`, { cookie: adminCookie })
    assert.equal(adminGetBooking.status, 403)

    const adminPatchBooking = await apiRequest(`/bookings/${inquiryBookingId}/status`, {
      method: 'PATCH',
      cookie: adminCookie,
      body: { status: 'cancelled' },
    })
    assert.equal(adminPatchBooking.status, 403)

    const adminPostBooking = await apiRequest('/bookings', {
      method: 'POST',
      cookie: adminCookie,
      body: {},
    })
    assert.equal(adminPostBooking.status, 403)

    const adminListPersonalInquiries = await apiRequest('/inquiries', { cookie: adminCookie })
    assert.equal(adminListPersonalInquiries.status, 403)

    // Admin accesses platform bookings & inquiries via properly scoped /api/admin/activity & /api/admin/summary
    const adminActivity = await apiRequest('/admin/activity', { cookie: adminCookie })
    assert.equal(adminActivity.status, 200)
    assert.ok(Array.isArray(adminActivity.data.bookings))
    assert.ok(adminActivity.data.bookings.some((b) => b.id === inquiryBookingId))

    const adminSummary = await apiRequest('/admin/summary', { cookie: adminCookie })
    assert.equal(adminSummary.status, 200)
    assert.ok(Number(adminSummary.data.counts.bookings) >= 2)

    // 3. ISS-07: Guest, Admin, Client, and Gardener floating message icon visibility & accessible label
    assert.equal(profileHelpers.shouldShowFloatingMessageIcon(null), false)
    assert.equal(profileHelpers.shouldShowFloatingMessageIcon(undefined), false)
    assert.equal(profileHelpers.shouldShowFloatingMessageIcon({ id: 1, role: 'administrator' }), false)
    assert.equal(profileHelpers.shouldShowFloatingMessageIcon({ id: clientId, role: 'client' }), true)
    assert.equal(profileHelpers.shouldShowFloatingMessageIcon({ id: gardenerId, role: 'gardener' }), true)
    assert.equal(profileHelpers.FLOATING_MESSAGE_ICON_LABEL, 'Open messages and notifications')
  })

  test('TC-18: Phase 3 (ISS-08, ISS-09) — Workflow status labels, unknown status fallbacks, mobile CSS wrapping, and booking mutual agreement summaries', async () => {
    const fs = require('node:fs')
    const path = require('node:path')
    const bookingHelpers = await import('../../frontend/src/services/bookings.js')

    // 1. ISS-08: Verify all newly supported and existing workflow status labels
    const expectedLabels = {
      provider_selected: 'Provider Selected',
      in_agreement: 'Agreement in Progress',
      confirmed: 'Confirmed',
      expired: 'Expired',
      withdrawn: 'Withdrawn',
      proposed: 'Proposed',
      agreed: 'Agreed',
      superseded: 'Superseded',
      in_progress: 'In Progress',
      completed: 'Completed',
      pending: 'Pending',
      open: 'Open',
      responded: 'Responded',
      closed: 'Closed',
      cancelled: 'Cancelled',
      draft: 'Draft',
      sent: 'Sent',
      accepted: 'Accepted',
      declined: 'Declined',
    }
    for (const [rawStatus, expectedLabel] of Object.entries(expectedLabels)) {
      assert.equal(bookingHelpers.formatStatusLabel(rawStatus), expectedLabel, `Status ${rawStatus} should render as "${expectedLabel}"`)
      assert.equal(bookingHelpers.getStatusBadgeClass(rawStatus), `inquiry-status status-${rawStatus}`)
    }

    // 2. ISS-08: Unknown status fallback behavior
    assert.equal(bookingHelpers.formatStatusLabel('awaiting_site_visit'), 'Awaiting Site Visit')
    assert.equal(bookingHelpers.formatStatusLabel(''), 'Unknown')
    assert.equal(bookingHelpers.formatStatusLabel(null), 'Unknown')
    assert.equal(bookingHelpers.formatStatusLabel(undefined), 'Unknown')
    assert.equal(bookingHelpers.getStatusBadgeClass('awaiting_site_visit'), 'inquiry-status status-awaiting_site_visit')
    assert.equal(bookingHelpers.getStatusBadgeClass(''), 'inquiry-status status-unknown')
    assert.equal(bookingHelpers.getStatusBadgeClass(null), 'inquiry-status status-unknown')

    // 3. ISS-08: Verify CSS status badge definitions and mobile flex-wrap rules in frontend/src/App.css
    const cssText = fs.readFileSync(path.join(__dirname, '../../frontend/src/App.css'), 'utf8')
    for (const cls of [
      '.status-provider_selected',
      '.status-in_agreement',
      '.status-confirmed',
      '.status-expired',
      '.status-withdrawn',
      '.status-proposed',
      '.status-agreed',
      '.status-superseded',
      '.status-pending',
      '.status-in_progress',
      '.status-completed',
      '.status-unknown',
    ]) {
      assert.ok(cssText.includes(cls), `App.css must define ${cls}`)
    }
    assert.match(cssText, /\.inquiry-status-row\s*\{[^}]*flex-wrap:\s*wrap/)
    assert.match(cssText, /\.booking-status-row\s*\{[^}]*flex-wrap:\s*wrap/)
    assert.match(cssText, /\.inline-actions\s*\{[^}]*flex-wrap:\s*wrap/)

    // 4. ISS-09: Booking agreement summary with complete live backend data
    const liveBookingRes = await apiRequest(`/bookings/${inquiryBookingId}`, { cookie: clientCookie })
    assert.equal(liveBookingRes.status, 200)
    const liveBooking = liveBookingRes.data.booking

    const completeSummary = bookingHelpers.buildBookingAgreementSummary(liveBooking, { id: clientId, role: 'client' })
    assert.equal(completeSummary.hasAgreement, true)
    assert.equal(completeSummary.versionLabel, 'Confirmed via Mutual Agreement v1')
    assert.match(completeSummary.amountLabel, /4,500\.00/)
    assert.match(completeSummary.amountLabel, /fixed project/)
    assert.equal(completeSummary.scopeOfWork, 'Includes shrub planting, soil prep, and stepping stones.')
    assert.equal(completeSummary.conditions, 'Gate code available upon arrival.')
    assert.equal(completeSummary.clientApproval.approved, true)
    assert.match(completeSummary.clientApproval.label, /^Approved on /)
    assert.equal(completeSummary.gardenerApproval.approved, true)
    assert.match(completeSummary.gardenerApproval.label, /^Approved on /)
    assert.equal(completeSummary.inquiryPath, `/inquiries/${inquiryId}`)

    // 5. ISS-09: Inquiry link visibility and authorization checks
    // Gardener who owns the booking can access the originating inquiry link
    const gardenerSummary = bookingHelpers.buildBookingAgreementSummary(liveBooking, { id: gardenerId, role: 'gardener' })
    assert.equal(gardenerSummary.inquiryPath, `/inquiries/${inquiryId}`)

    // Unrelated user or unauthenticated user does not get the originating inquiry link
    const outsiderSummary = bookingHelpers.buildBookingAgreementSummary(liveBooking, { id: 999999, role: 'client' })
    assert.equal(outsiderSummary.inquiryPath, null)
    const guestSummary = bookingHelpers.buildBookingAgreementSummary(liveBooking, null)
    assert.equal(guestSummary.inquiryPath, null)

    // 6. ISS-09: Booking agreement summary with null or incomplete data (never invents approvals or fields)
    const legacyBooking = {
      id: 1,
      inquiry_id: null,
      agreement_id: null,
      agreement_version: null,
      agreed_amount: null,
      agreed_price_basis: null,
      agreed_scope: null,
      agreed_conditions: null,
      client_approved_at: null,
      gardener_approved_at: null,
      client_id: clientId,
      gardener_id: gardenerId,
    }
    const legacySummary = bookingHelpers.buildBookingAgreementSummary(legacyBooking, { id: clientId, role: 'client' })
    assert.equal(legacySummary.hasAgreement, false)
    assert.equal(legacySummary.versionLabel, null)
    assert.equal(legacySummary.amountLabel, null)
    assert.equal(legacySummary.scopeOfWork, null)
    assert.equal(legacySummary.conditions, null)
    assert.equal(legacySummary.clientApproval.approved, false)
    assert.equal(legacySummary.gardenerApproval.approved, false)
    assert.equal(legacySummary.inquiryPath, null)

    // Incomplete agreement data: client approved, gardener timestamp missing -> must not claim gardener approved
    const partialBooking = {
      id: 2,
      inquiry_id: inquiryId,
      agreement_id: 10,
      agreement_version: 2,
      agreed_amount: 1800,
      agreed_price_basis: null,
      agreed_scope: 'Trim hedges only',
      agreed_conditions: '',
      client_approved_at: '2026-11-12T10:00:00.000Z',
      gardener_approved_at: null,
      client_id: clientId,
      gardener_id: gardenerId,
    }
    const partialSummary = bookingHelpers.buildBookingAgreementSummary(partialBooking, { id: clientId, role: 'client' })
    assert.equal(partialSummary.hasAgreement, true)
    assert.equal(partialSummary.versionLabel, 'Confirmed via Mutual Agreement v2')
    assert.match(partialSummary.amountLabel, /1,800\.00/)
    assert.equal(partialSummary.scopeOfWork, 'Trim hedges only')
    assert.equal(partialSummary.conditions, null)
    assert.equal(partialSummary.clientApproval.approved, true)
    assert.equal(partialSummary.gardenerApproval.approved, false)
    assert.equal(partialSummary.gardenerApproval.label, 'Pending / Not recorded')
    assert.equal(partialSummary.inquiryPath, `/inquiries/${inquiryId}`)
  })
})
