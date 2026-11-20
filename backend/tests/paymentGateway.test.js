const path = require('node:path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true })
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-suite'
// Ensure deterministic Sandbox/Demo mode during automated test runs (no external network calls)
delete process.env.PAYMONGO_SECRET_KEY

const { after, before, describe, it } = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const bcrypt = require('bcryptjs')
const app = require('../app')
const { pool } = require('../config/database')

let server
let baseUrl
let clientCookie
let gardenerCookie
let clerkId
let clientId
let gardenerId
let bookingId
let agreementId
let inquiryId
const createdUserIds = []

async function api(route, options = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  const text = await response.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  const setCookie = response.headers.get('set-cookie')
  return {
    status: response.status,
    cookie: setCookie ? setCookie.split(';')[0] : null,
    data,
  }
}

async function seedUser({ email, password, role, firstName, lastName }) {
  const hash = await bcrypt.hash(password, 10)
  const [res] = await pool.execute(
    `INSERT INTO users (email, password_hash, role, can_act_as_client, can_act_as_gardener, first_name, last_name, phone, date_of_birth)
     VALUES (?, ?, ?, ?, ?, ?, ?, '09171234567', '1991-04-20')`,
    [email, hash, role, role === 'client' ? 1 : 0, role === 'gardener' ? 1 : 0, firstName, lastName],
  )
  const userId = res.insertId
  createdUserIds.push(userId)

  if (role === 'client') {
    await pool.execute('INSERT INTO client_profiles (user_id, address, city) VALUES (?, ?, ?)', [userId, 'Brgy. Tetuan', 'Zamboanga City'])
  } else if (role === 'gardener') {
    await pool.execute(
      `INSERT INTO gardener_profiles (user_id, business_name, service_area, years_of_experience, is_approved)
       VALUES (?, ?, 'Zamboanga City', 5, TRUE)`,
      [userId, `${firstName} Landscapes`],
    )
  }

  const loginRes = await api('/auth/login', {
    method: 'POST',
    body: { email, password },
  })
  assert.equal(loginRes.status, 200)
  return { userId, cookie: loginRes.cookie }
}

describe('Step 3 (Migration 013): Third-Party Payment Gateway (PayMongo + Sandbox/Demo Fallback)', () => {
  before(async () => {
    server = http.createServer(app)
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const { port } = server.address()
    baseUrl = `http://127.0.0.1:${port}/api`

    const stamp = Date.now()
    const client = await seedUser({
      email: `gw_client_${stamp}@test.local`,
      password: 'Password123!',
      role: 'client',
      firstName: 'Gateway',
      lastName: 'Client',
    })
    clientId = client.userId
    clientCookie = client.cookie

    const gardener = await seedUser({
      email: `gw_gardener_${stamp}@test.local`,
      password: 'Password123!',
      role: 'gardener',
      firstName: 'Gateway',
      lastName: 'Gardener',
    })
    gardenerId = gardener.userId
    gardenerCookie = gardener.cookie

    const clerk = await seedUser({
      email: `gw_clerk_${stamp}@test.local`,
      password: 'Password123!',
      role: 'clerk',
      firstName: 'Gateway',
      lastName: 'Clerk',
    })
    clerkId = clerk.userId

    await pool.execute(
      'INSERT INTO clerk_gardener_assignments (clerk_id, gardener_id, notes) VALUES (?, ?, ?)',
      [clerkId, gardenerId, 'Notified on online payments'],
    )

    // Seed inquiry, agreed agreement (PHP 2000 total, PHP 600 deposit), and reserved booking
    const [inqIns] = await pool.execute(
      `INSERT INTO inquiries (client_id, gardener_id, request_type, subject, description, location, status)
       VALUES (?, ?, 'direct', 'Gateway test inquiry', 'Garden makeover test', 'Zamboanga City', 'confirmed')`,
      [clientId, gardenerId],
    )
    inquiryId = inqIns.insertId

    const [agIns] = await pool.execute(
      `INSERT INTO agreements
        (inquiry_id, client_id, gardener_id, version, scope_of_work, amount, required_deposit_amount,
         scheduled_start, scheduled_end, location, proposed_by, client_approved_at, gardener_approved_at, status)
       VALUES (?, ?, ?, 1, 'Landscaping gateway test', 2000.00, 600.00,
               '2026-12-20 08:00:00', '2026-12-20 16:00:00', 'Tetuan, Zamboanga City', ?, NOW(), NOW(), 'agreed')`,
      [inquiryId, clientId, gardenerId, gardenerId],
    )
    agreementId = agIns.insertId

    const [bIns] = await pool.execute(
      `INSERT INTO bookings
        (inquiry_id, agreement_id, client_id, gardener_id, scheduled_start, scheduled_end, location,
         status, booking_stage, payment_status, required_deposit_amount, amount_paid)
       VALUES (?, ?, ?, ?, '2026-12-20 08:00:00', '2026-12-20 16:00:00', 'Tetuan, Zamboanga City',
               'accepted', 'reserved', 'unpaid', 600.00, 0.00)`,
      [inquiryId, agreementId, clientId, gardenerId],
    )
    bookingId = bIns.insertId
  })

  after(async () => {
    try {
      if (bookingId) {
        await pool.query('DELETE FROM booking_payments WHERE booking_id = ?', [bookingId])
        await pool.query('DELETE FROM bookings WHERE id = ?', [bookingId])
      }
      if (agreementId) await pool.query('DELETE FROM agreements WHERE id = ?', [agreementId])
      if (inquiryId) await pool.query('DELETE FROM inquiries WHERE id = ?', [inquiryId])
      if (createdUserIds.length > 0) {
        const ph = createdUserIds.map(() => '?').join(', ')
        await pool.query(`DELETE FROM clerk_gardener_assignments WHERE clerk_id IN (${ph}) OR gardener_id IN (${ph})`, [...createdUserIds, ...createdUserIds])
        await pool.query(`DELETE FROM notifications WHERE user_id IN (${ph})`, createdUserIds)
        await pool.query(`DELETE FROM gardener_profiles WHERE user_id IN (${ph})`, createdUserIds)
        await pool.query(`DELETE FROM client_profiles WHERE user_id IN (${ph})`, createdUserIds)
        await pool.query(`DELETE FROM users WHERE id IN (${ph})`, createdUserIds)
      }
    } finally {
      if (server) await new Promise((resolve) => server.close(resolve))
      await pool.end()
    }
  })

  it('returns active gateway config (Sandbox/Demo fallback when PAYMONGO_SECRET_KEY is not set)', async () => {
    const res = await api('/bookings/payment-gateway/config', {
      headers: { Cookie: clientCookie },
    })
    assert.equal(res.status, 200)
    assert.equal(res.data.gateway.provider, 'sandbox_demo')
    assert.equal(res.data.gateway.minAmountPhp, 20)
    assert.deepEqual(res.data.gateway.supportedMethods, ['gcash', 'maya', 'grab_pay', 'card'])
  })

  it('validates online payment method, minimum amount, and client role', async () => {
    const badMethod = await api(`/bookings/${bookingId}/payments/checkout`, {
      method: 'POST',
      headers: { Cookie: clientCookie },
      body: { paymentType: 'partial', paymentMethod: 'cash', amount: 600 },
    })
    assert.equal(badMethod.status, 400)

    const tooLow = await api(`/bookings/${bookingId}/payments/checkout`, {
      method: 'POST',
      headers: { Cookie: clientCookie },
      body: { paymentType: 'partial', paymentMethod: 'gcash', amount: 10 },
    })
    assert.equal(tooLow.status, 400)

    const gardenerTry = await api(`/bookings/${bookingId}/payments/checkout`, {
      method: 'POST',
      headers: { Cookie: gardenerCookie },
      body: { paymentType: 'partial', paymentMethod: 'gcash', amount: 600 },
    })
    assert.equal(gardenerTry.status, 403)
  })

  it('executes cancelled checkout, verified deposit upgrade (reserved -> booked), idempotent confirm, and post-completion balance payment', async () => {
    // 1. Cancelled checkout should NOT credit amount_paid
    const cancelInit = await api(`/bookings/${bookingId}/payments/checkout`, {
      method: 'POST',
      headers: { Cookie: clientCookie },
      body: { paymentType: 'partial', paymentMethod: 'maya', amount: 600 },
    })
    assert.equal(cancelInit.status, 201)
    assert.equal(cancelInit.data.checkout.provider, 'sandbox_demo')
    assert.match(cancelInit.data.checkout.sessionId, /^cs_demo_/)
    assert.match(cancelInit.data.checkout.transactionCode, /^TXN-/)

    const cancelConfirm = await api(`/bookings/${bookingId}/payments/${cancelInit.data.id}/confirm-gateway`, {
      method: 'POST',
      headers: { Cookie: clientCookie },
      body: { demoOutcome: 'cancelled' },
    })
    assert.equal(cancelConfirm.status, 200)
    assert.equal(cancelConfirm.data.confirmed, false)
    assert.equal(cancelConfirm.data.payment.status, 'rejected')
    assert.equal(cancelConfirm.data.payment.gateway_status, 'cancelled')
    assert.equal(cancelConfirm.data.booking.booking_stage, 'reserved')
    assert.equal(Number(cancelConfirm.data.booking.amount_paid), 0)

    // 2. Paid deposit checkout upgrades Reservation -> Confirmed Paid Booking & notifies gardener + assigned clerk
    const depInit = await api(`/bookings/${bookingId}/payments/checkout`, {
      method: 'POST',
      headers: { Cookie: clientCookie },
      body: { paymentType: 'partial', paymentMethod: 'gcash', amount: 600, notes: 'GCash online deposit' },
    })
    assert.equal(depInit.status, 201)

    const depConfirm = await api(`/bookings/${bookingId}/payments/${depInit.data.id}/confirm-gateway`, {
      method: 'POST',
      headers: { Cookie: clientCookie },
      body: { demoOutcome: 'paid' },
    })
    assert.equal(depConfirm.status, 200)
    assert.equal(depConfirm.data.confirmed, true)
    assert.equal(depConfirm.data.payment.status, 'verified')
    assert.equal(depConfirm.data.payment.gateway_status, 'paid')
    assert.match(depConfirm.data.payment.reference_number, /^DEMO-/)
    assert.equal(depConfirm.data.booking.booking_stage, 'booked')
    assert.equal(depConfirm.data.booking.payment_status, 'partially_paid')
    assert.equal(Number(depConfirm.data.booking.amount_paid), 600)
    assert.equal(Number(depConfirm.data.booking.remaining_balance), 1400)

    // Verify gardener and assigned clerk both received payment notifications
    const [notifs] = await pool.query(
      "SELECT user_id FROM notifications WHERE related_entity_type = 'booking' AND related_entity_id = ? AND notification_type = 'booking_payment'",
      [bookingId],
    )
    const notifiedIds = new Set(notifs.map((n) => n.user_id))
    assert.ok(notifiedIds.has(gardenerId), 'Gardener should be notified of online payment')
    assert.ok(notifiedIds.has(clerkId), 'Assigned clerk should be notified of online payment')

    // 3. Re-confirming the same payment must be idempotent (never double-credit)
    const dupConfirm = await api(`/bookings/${bookingId}/payments/${depInit.data.id}/confirm-gateway`, {
      method: 'POST',
      headers: { Cookie: clientCookie },
      body: { demoOutcome: 'paid' },
    })
    assert.equal(dupConfirm.status, 200)
    assert.equal(dupConfirm.data.alreadyProcessed, true)
    assert.equal(Number(dupConfirm.data.booking.amount_paid), 600)

    // 4. Gardener starts and completes service, then client pays remaining balance online via Card
    const startRes = await api(`/bookings/${bookingId}/status`, {
      method: 'PATCH',
      headers: { Cookie: gardenerCookie },
      body: { status: 'in_progress' },
    })
    assert.equal(startRes.status, 200)

    const compRes = await api(`/bookings/${bookingId}/status`, {
      method: 'PATCH',
      headers: { Cookie: gardenerCookie },
      body: { status: 'completed' },
    })
    assert.equal(compRes.status, 200)

    const balInit = await api(`/bookings/${bookingId}/payments/checkout`, {
      method: 'POST',
      headers: { Cookie: clientCookie },
      body: { paymentType: 'balance', paymentMethod: 'card', amount: 1400 },
    })
    assert.equal(balInit.status, 201)

    const balConfirm = await api(`/bookings/${bookingId}/payments/${balInit.data.id}/confirm-gateway`, {
      method: 'POST',
      headers: { Cookie: clientCookie },
      body: { demoOutcome: 'paid' },
    })
    assert.equal(balConfirm.status, 200)
    assert.equal(balConfirm.data.confirmed, true)
    assert.equal(balConfirm.data.booking.payment_status, 'fully_paid')
    assert.equal(balConfirm.data.booking.transaction_status, 'pending_closure')
    assert.equal(Number(balConfirm.data.booking.amount_paid), 2000)
    assert.equal(Number(balConfirm.data.booking.remaining_balance), 0)
  })
})
