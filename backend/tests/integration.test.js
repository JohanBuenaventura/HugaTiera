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
})
