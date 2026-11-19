const path = require('node:path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true })
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-suite'
const { after, before, describe, it } = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const bcrypt = require('bcryptjs')
const app = require('../app')
const { pool } = require('../config/database')
const { paymentReceiptsDirectory, removeFileIfExists } = require('../middleware/upload.middleware')

const VALID_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

let server
let baseUrl
let clientCookie
let otherClientCookie
let gardenerCookie
let gardenerId
let serviceId
const createdUserIds = []
const createdInquiryIds = []
const createdReceiptPaths = []

async function api(route, options = {}) {
  const isForm = options.body instanceof FormData
  const response = await fetch(`${baseUrl}${route}`, {
    ...options,
    headers: isForm
      ? options.headers
      : { 'Content-Type': 'application/json', ...options.headers },
    body: isForm ? options.body : (options.body ? JSON.stringify(options.body) : undefined),
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

describe('Reservation vs. Paid Booking Lifecycle (Deposit Gate, Proof Upload & Gardener Verification)', () => {
  const runId = Date.now()

  before(async () => {
    const [[dbRow]] = await pool.query('SELECT DATABASE() AS db')
    assert.equal(dbRow.db, 'hugatiera_db_migration_test', 'Must run against hugatiera_db_migration_test')

    server = http.createServer(app)
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    baseUrl = `http://127.0.0.1:${server.address().port}/api`

    const hash = await bcrypt.hash('Password123!', 10)
    for (const u of [
      { key: 'client', role: 'client', first: 'PayClient' },
      { key: 'other', role: 'client', first: 'OtherClient' },
      { key: 'gardener', role: 'gardener', first: 'PayGardener' },
    ]) {
      const email = `pay.${u.key}.${runId}@hugatiera.test`
      const [ins] = await pool.execute(
        'INSERT INTO users (email, password_hash, role, first_name, last_name, phone, date_of_birth) VALUES (?, ?, ?, ?, "Test", "09171234567", "1994-05-05")',
        [email, hash, u.role, u.first],
      )
      createdUserIds.push(ins.insertId)
      if (u.role === 'client') {
        await pool.execute('INSERT INTO client_profiles (user_id, address, city) VALUES (?, "Tetuan", "Zamboanga City")', [ins.insertId])
      } else {
        gardenerId = ins.insertId
        await pool.execute('INSERT INTO gardener_profiles (user_id, business_name, is_approved) VALUES (?, "Pay Gardens", TRUE)', [ins.insertId])
      }
      const login = await api('/auth/login', { method: 'POST', body: { email, password: 'Password123!' } })
      assert.equal(login.status, 200)
      if (u.key === 'client') clientCookie = login.cookie
      if (u.key === 'other') otherClientCookie = login.cookie
      if (u.key === 'gardener') gardenerCookie = login.cookie
    }

    const [cats] = await pool.execute('SELECT id FROM service_categories WHERE is_active = TRUE LIMIT 1')
    const [svc] = await pool.execute(
      `INSERT INTO services (gardener_id, category_id, title, description, indicative_price, price_unit, service_area)
       VALUES (?, ?, 'Full Yard Makeover', 'Landscaping package', 2000.00, 'per project', 'Zamboanga City')`,
      [gardenerId, cats[0].id],
    )
    serviceId = svc.insertId
  })

  after(async () => {
    for (const rel of createdReceiptPaths) {
      await removeFileIfExists(paymentReceiptsDirectory, rel)
    }
    if (createdInquiryIds.length > 0) {
      await pool.query('UPDATE agreements SET previous_agreement_id = NULL WHERE inquiry_id IN (?)', [createdInquiryIds])
      await pool.query('DELETE FROM bookings WHERE inquiry_id IN (?)', [createdInquiryIds])
      await pool.query('DELETE FROM agreements WHERE inquiry_id IN (?)', [createdInquiryIds])
      await pool.query('DELETE FROM request_events WHERE inquiry_id IN (?)', [createdInquiryIds])
      await pool.query('DELETE FROM inquiries WHERE id IN (?)', [createdInquiryIds])
    }
    if (serviceId) await pool.query('DELETE FROM services WHERE id = ?', [serviceId])
    if (createdUserIds.length > 0) {
      await pool.query('DELETE FROM notifications WHERE user_id IN (?)', [createdUserIds])
      await pool.query('DELETE FROM users WHERE id IN (?)', [createdUserIds])
    }
    if (server) await new Promise((resolve) => server.close(resolve))
    await pool.end()
  })

  it('creates an unpaid reservation on mutual agreement, blocks in_progress until deposit is verified, protects receipt privacy, and tracks partial -> full payment', async () => {
    // 1. Propose agreement of PHP 2000 (default 30% deposit = PHP 600)
    const prop = await api('/agreements/direct-service', {
      method: 'POST',
      headers: { Cookie: clientCookie },
      body: {
        serviceId,
        scopeOfWork: 'Full yard landscaping makeover',
        amount: 2000,
        scheduledStart: '2027-04-05T08:00',
        scheduledEnd: '2027-04-05T16:00',
        location: 'Tetuan, Zamboanga City',
      },
    })
    assert.equal(prop.status, 201)
    createdInquiryIds.push(prop.data.inquiryId)
    assert.equal(Number(prop.data.agreement.required_deposit_amount), 600)

    const agId = prop.data.agreement.id
    await api(`/agreements/${agId}/approve`, { method: 'POST', headers: { Cookie: clientCookie }, body: { version: 1 } })
    const gApp = await api(`/agreements/${agId}/approve`, { method: 'POST', headers: { Cookie: gardenerCookie }, body: { version: 1 } })
    assert.equal(gApp.status, 200)
    const bookingId = gApp.data.booking.id

    // Newly approved arrangement is a RESERVATION (unpaid), NOT yet a paid booked job
    const detail1 = await api(`/bookings/${bookingId}`, { headers: { Cookie: clientCookie } })
    assert.equal(detail1.status, 200)
    assert.equal(detail1.data.booking.booking_stage, 'reserved')
    assert.equal(detail1.data.booking.payment_status, 'unpaid')
    assert.equal(Number(detail1.data.booking.required_deposit_amount), 600)
    assert.equal(Number(detail1.data.booking.remaining_balance), 2000)

    // Gardener cannot start service while still reserved/unpaid -> 409 PAYMENT_REQUIRED
    const blockedStart = await api(`/bookings/${bookingId}/status`, {
      method: 'PATCH',
      headers: { Cookie: gardenerCookie },
      body: { status: 'in_progress' },
    })
    assert.equal(blockedStart.status, 409)
    assert.equal(blockedStart.data.code, 'PAYMENT_REQUIRED')

    // 2. Client submits receipt image + payment proof (PHP 300 — below PHP 600 deposit)
    const form1 = new FormData()
    form1.append('paymentType', 'partial')
    form1.append('paymentMethod', 'gcash')
    form1.append('amount', '300')
    form1.append('referenceNumber', 'GCASH-001')
    form1.append('receipt', new Blob([VALID_PNG], { type: 'image/png' }), 'receipt1.png')
    const pay1 = await api(`/bookings/${bookingId}/payments`, {
      method: 'POST',
      headers: { Cookie: clientCookie },
      body: form1,
    })
    assert.equal(pay1.status, 201)
    assert.ok(pay1.data.payment.receipt_path)
    createdReceiptPaths.push(pay1.data.payment.receipt_path)

    // Receipt privacy: unrelated client gets 403, owning client & gardener get 200
    const otherReceipt = await fetch(`${baseUrl}/bookings/${bookingId}/payments/${pay1.data.id}/receipt`, {
      headers: { Cookie: otherClientCookie },
    })
    assert.equal(otherReceipt.status, 403)
    const gardenerReceipt = await fetch(`${baseUrl}/bookings/${bookingId}/payments/${pay1.data.id}/receipt`, {
      headers: { Cookie: gardenerCookie },
    })
    assert.equal(gardenerReceipt.status, 200)

    // Gardener verifies PHP 300 -> partially_paid, but STILL 'reserved' because 300 < 600 required deposit!
    const ver1 = await api(`/bookings/${bookingId}/payments/${pay1.data.id}`, {
      method: 'PATCH',
      headers: { Cookie: gardenerCookie },
      body: { decision: 'verified' },
    })
    assert.equal(ver1.status, 200)
    assert.equal(ver1.data.booking.payment_status, 'partially_paid')
    assert.equal(ver1.data.booking.booking_stage, 'reserved')

    // Still blocked from starting service until deposit threshold is met
    const stillBlocked = await api(`/bookings/${bookingId}/status`, {
      method: 'PATCH',
      headers: { Cookie: gardenerCookie },
      body: { status: 'in_progress' },
    })
    assert.equal(stillBlocked.status, 409)
    assert.equal(stillBlocked.data.code, 'PAYMENT_REQUIRED')

    // 3. Client submits another PHP 300 (completing the PHP 600 deposit) -> rejected first, then re-submitted & verified
    const payBad = await api(`/bookings/${bookingId}/payments`, {
      method: 'POST',
      headers: { Cookie: clientCookie },
      body: { paymentType: 'partial', paymentMethod: 'maya', amount: 300, referenceNumber: 'BAD-REF' },
    })
    assert.equal(payBad.status, 201)
    const rej = await api(`/bookings/${bookingId}/payments/${payBad.data.id}`, {
      method: 'PATCH',
      headers: { Cookie: gardenerCookie },
      body: { decision: 'rejected', rejectionReason: 'Reference number not found in Maya.' },
    })
    assert.equal(rej.status, 200)
    assert.equal(rej.data.payment.status, 'rejected')
    assert.equal(rej.data.booking.booking_stage, 'reserved')

    const pay2 = await api(`/bookings/${bookingId}/payments`, {
      method: 'POST',
      headers: { Cookie: clientCookie },
      body: { paymentType: 'partial', paymentMethod: 'gcash', amount: 300, referenceNumber: 'GCASH-002' },
    })
    assert.equal(pay2.status, 201)
    const ver2 = await api(`/bookings/${bookingId}/payments/${pay2.data.id}`, {
      method: 'PATCH',
      headers: { Cookie: gardenerCookie },
      body: { decision: 'verified' },
    })
    assert.equal(ver2.status, 200)
    assert.equal(ver2.data.booking.booking_stage, 'booked')
    assert.equal(ver2.data.booking.payment_status, 'partially_paid')
    assert.equal(Number(ver2.data.booking.amount_paid), 600)
    assert.equal(Number(ver2.data.booking.remaining_balance), 1400)

    // NOW gardener can start service!
    const startOk = await api(`/bookings/${bookingId}/status`, {
      method: 'PATCH',
      headers: { Cookie: gardenerCookie },
      body: { status: 'in_progress' },
    })
    assert.equal(startOk.status, 200)

    // 4. Client pays remaining PHP 1400 balance -> gardener verifies -> fully_paid & remaining_balance = 0
    const pay3 = await api(`/bookings/${bookingId}/payments`, {
      method: 'POST',
      headers: { Cookie: clientCookie },
      body: { paymentType: 'balance', paymentMethod: 'cash', amount: 1400, notes: 'Paid balance in cash on site' },
    })
    assert.equal(pay3.status, 201)
    const ver3 = await api(`/bookings/${bookingId}/payments/${pay3.data.id}`, {
      method: 'PATCH',
      headers: { Cookie: gardenerCookie },
      body: { decision: 'verified' },
    })
    assert.equal(ver3.status, 200)
    assert.equal(ver3.data.booking.payment_status, 'fully_paid')
    assert.equal(Number(ver3.data.booking.remaining_balance), 0)

    // Extra payment after fully_paid is rejected with 409
    const extraPay = await api(`/bookings/${bookingId}/payments`, {
      method: 'POST',
      headers: { Cookie: clientCookie },
      body: { paymentType: 'balance', paymentMethod: 'cash', amount: 100 },
    })
    assert.equal(extraPay.status, 409)
  })
})
