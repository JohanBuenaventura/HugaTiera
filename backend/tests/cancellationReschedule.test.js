const path = require('node:path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true })
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-suite'
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
let clientId
let gardenerId
let serviceId
const createdUserIds = []
const createdInquiryIds = []

async function api(route, options = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
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

async function createApprovedBooking({ start, end, amount = 2000 }) {
  const prop = await api('/agreements/direct-service', {
    method: 'POST',
    headers: { Cookie: clientCookie },
    body: {
      serviceId,
      scopeOfWork: 'Tropical garden cleanup and trimming',
      amount,
      scheduledStart: start,
      scheduledEnd: end,
      location: 'Tetuan, Zamboanga City',
    },
  })
  assert.equal(prop.status, 201)
  createdInquiryIds.push(prop.data.inquiryId)
  const agId = prop.data.agreement.id
  await api(`/agreements/${agId}/approve`, { method: 'POST', headers: { Cookie: clientCookie }, body: { version: 1 } })
  const gApp = await api(`/agreements/${agId}/approve`, { method: 'POST', headers: { Cookie: gardenerCookie }, body: { version: 1 } })
  assert.equal(gApp.status, 200)
  return gApp.data.booking.id
}

describe('Event-Based Cancellation & Mutual Rescheduling (Typhoon, Accident, Plan Changes)', () => {
  const runId = Date.now()

  before(async () => {
    const [[dbRow]] = await pool.query('SELECT DATABASE() AS db')
    assert.equal(dbRow.db, 'hugatiera_db_migration_test', 'Must run against hugatiera_db_migration_test')

    server = http.createServer(app)
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    baseUrl = `http://127.0.0.1:${server.address().port}/api`

    const hash = await bcrypt.hash('Password123!', 10)
    for (const u of [
      { key: 'client', role: 'client', first: 'ReschedClient' },
      { key: 'gardener', role: 'gardener', first: 'ReschedGardener' },
    ]) {
      const email = `resched.${u.key}.${runId}@hugatiera.test`
      const [ins] = await pool.execute(
        'INSERT INTO users (email, password_hash, role, first_name, last_name, phone, date_of_birth) VALUES (?, ?, ?, ?, "Test", "09171234567", "1993-04-04")',
        [email, hash, u.role, u.first],
      )
      createdUserIds.push(ins.insertId)
      if (u.role === 'client') {
        clientId = ins.insertId
        await pool.execute('INSERT INTO client_profiles (user_id, address, city) VALUES (?, "Tetuan", "Zamboanga City")', [ins.insertId])
      } else {
        gardenerId = ins.insertId
        await pool.execute('INSERT INTO gardener_profiles (user_id, business_name, is_approved) VALUES (?, "StormSafe Gardens", TRUE)', [ins.insertId])
      }
      const login = await api('/auth/login', { method: 'POST', body: { email, password: 'Password123!' } })
      assert.equal(login.status, 200)
      if (u.key === 'client') clientCookie = login.cookie
      if (u.key === 'gardener') gardenerCookie = login.cookie
    }

    const [cats] = await pool.execute('SELECT id FROM service_categories WHERE is_active = TRUE LIMIT 1')
    const [svc] = await pool.execute(
      `INSERT INTO services (gardener_id, category_id, title, description, indicative_price, price_unit, service_area)
       VALUES (?, ?, 'Storm Recovery Pruning', 'Trimming and yard cleanup', 2000.00, 'per project', 'Zamboanga City')`,
      [gardenerId, cats[0].id],
    )
    serviceId = svc.insertId
  })

  after(async () => {
    try {
      if (gardenerId) {
        await pool.query('DELETE FROM gardener_unavailable_dates WHERE gardener_id = ?', [gardenerId])
      }
      if (createdInquiryIds.length > 0) {
        await pool.query('UPDATE agreements SET previous_agreement_id = NULL WHERE inquiry_id IN (?)', [createdInquiryIds])
        await pool.query('DELETE FROM reviews WHERE booking_id IN (SELECT id FROM bookings WHERE inquiry_id IN (?))', [createdInquiryIds])
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
    } finally {
      if (server) await new Promise((resolve) => server.close(resolve))
      await pool.end()
    }
  })

  it('supports mutual rescheduling due to typhoon/events while preserving verified payments and enforcing availability', async () => {
    const bookingId = await createApprovedBooking({
      start: '2027-05-10T08:00',
      end: '2027-05-10T12:00',
    })

    // Pay & verify 30% deposit (PHP 600) -> confirmed paid booking
    const pay = await api(`/bookings/${bookingId}/payments`, {
      method: 'POST',
      headers: { Cookie: clientCookie },
      body: { paymentType: 'partial', paymentMethod: 'gcash', amount: 600, referenceNumber: 'GCASH-RS-1' },
    })
    assert.equal(pay.status, 201)
    const ver = await api(`/bookings/${bookingId}/payments/${pay.data.id}`, {
      method: 'PATCH',
      headers: { Cookie: gardenerCookie },
      body: { decision: 'verified' },
    })
    assert.equal(ver.status, 200)
    assert.equal(ver.data.booking.booking_stage, 'booked')

    // Gardener blocks 2027-05-15 -> reschedule to blocked date is rejected
    await pool.execute(
      'INSERT INTO gardener_unavailable_dates (gardener_id, start_date, end_date, reason) VALUES (?, "2027-05-15", "2027-05-15", "Family event")',
      [gardenerId],
    )
    const blockedResched = await api(`/bookings/${bookingId}/reschedule-requests`, {
      method: 'POST',
      headers: { Cookie: clientCookie },
      body: {
        reasonType: 'typhoon_weather',
        reasonDetails: 'Typhoon warning in Zamboanga City',
        proposedStart: '2027-05-15T08:00',
        proposedEnd: '2027-05-15T12:00',
      },
    })
    assert.equal(blockedResched.status, 409)
    assert.equal(blockedResched.data.code, 'GARDENER_UNAVAILABLE')

    // Live availability check shifting by 2 hours with excludeBookingId succeeds (no self-conflict)
    const selfShiftCheck = await api(`/gardeners/${gardenerId}/availability/check`, {
      method: 'POST',
      body: {
        scheduledStart: '2027-05-10T10:00',
        scheduledEnd: '2027-05-10T14:00',
        excludeBookingId: bookingId,
      },
    })
    assert.equal(selfShiftCheck.status, 200)
    assert.equal(selfShiftCheck.data.available, true)

    // Client requests reschedule to 2027-05-12 due to typhoon
    const req1 = await api(`/bookings/${bookingId}/reschedule-requests`, {
      method: 'POST',
      headers: { Cookie: clientCookie },
      body: {
        reasonType: 'typhoon_weather',
        reasonDetails: 'Typhoon Signal #2 expected on May 10; moving to May 12.',
        proposedStart: '2027-05-12T08:00',
        proposedEnd: '2027-05-12T12:00',
      },
    })
    assert.equal(req1.status, 201)
    const req1Id = req1.data.id

    // Duplicate pending reschedule request is blocked
    const dupReq = await api(`/bookings/${bookingId}/reschedule-requests`, {
      method: 'POST',
      headers: { Cookie: gardenerCookie },
      body: {
        reasonType: 'schedule_conflict',
        reasonDetails: 'Another overlapping request',
        proposedStart: '2027-05-13T08:00',
        proposedEnd: '2027-05-13T12:00',
      },
    })
    assert.equal(dupReq.status, 409)
    assert.equal(dupReq.data.code, 'RESCHEDULE_ALREADY_PENDING')

    // Client cannot self-approve their own reschedule request
    const selfApprove = await api(`/bookings/${bookingId}/reschedule-requests/${req1Id}`, {
      method: 'PATCH',
      headers: { Cookie: clientCookie },
      body: { decision: 'approved' },
    })
    assert.equal(selfApprove.status, 403)
    assert.equal(selfApprove.data.code, 'SELF_APPROVAL_FORBIDDEN')

    // Gardener approves -> schedule moves to May 12 and verified payment & booked stage stay intact
    const approve = await api(`/bookings/${bookingId}/reschedule-requests/${req1Id}`, {
      method: 'PATCH',
      headers: { Cookie: gardenerCookie },
      body: { decision: 'approved', responseNote: 'Approved, stay safe during the typhoon!' },
    })
    assert.equal(approve.status, 200)
    assert.equal(approve.data.rescheduleRequest.status, 'approved')
    assert.equal(approve.data.booking.booking_stage, 'booked')
    assert.equal(Number(approve.data.booking.amount_paid), 600)
    assert.ok(String(approve.data.booking.scheduled_start).startsWith('2027-05-12'))

    // Gardener proposes reschedule -> client declines -> schedule remains May 12
    const req2 = await api(`/bookings/${bookingId}/reschedule-requests`, {
      method: 'POST',
      headers: { Cookie: gardenerCookie },
      body: {
        reasonType: 'scope_or_plan_change',
        reasonDetails: 'Requesting afternoon shift instead',
        proposedStart: '2027-05-12T13:00',
        proposedEnd: '2027-05-12T17:00',
      },
    })
    assert.equal(req2.status, 201)
    const decline = await api(`/bookings/${bookingId}/reschedule-requests/${req2.data.id}`, {
      method: 'PATCH',
      headers: { Cookie: clientCookie },
      body: { decision: 'declined', responseNote: 'Morning works better for us.' },
    })
    assert.equal(decline.status, 200)
    assert.equal(decline.data.rescheduleRequest.status, 'declined')

    // Client proposes another reschedule and withdraws it
    const req3 = await api(`/bookings/${bookingId}/reschedule-requests`, {
      method: 'POST',
      headers: { Cookie: clientCookie },
      body: {
        reasonType: 'schedule_conflict',
        reasonDetails: 'Might need to move to May 14',
        proposedStart: '2027-05-14T08:00',
        proposedEnd: '2027-05-14T12:00',
      },
    })
    assert.equal(req3.status, 201)
    const withdraw = await api(`/bookings/${bookingId}/reschedule-requests/${req3.data.id}`, {
      method: 'PATCH',
      headers: { Cookie: clientCookie },
      body: { decision: 'cancelled' },
    })
    assert.equal(withdraw.status, 200)
    assert.equal(withdraw.data.rescheduleRequest.status, 'cancelled')
  })

  it('requires structured event reasons for cancellation by client or gardener, cancels pending reschedules, and frees the time slot', async () => {
    const bookingId = await createApprovedBooking({
      start: '2027-05-20T08:00',
      end: '2027-05-20T12:00',
    })

    // Missing cancellation reason is rejected with 400
    const badCancel = await api(`/bookings/${bookingId}/status`, {
      method: 'PATCH',
      headers: { Cookie: gardenerCookie },
      body: { status: 'cancelled' },
    })
    assert.equal(badCancel.status, 400)

    // Create a pending reschedule request first to verify auto-cancellation
    const pendingRr = await api(`/bookings/${bookingId}/reschedule-requests`, {
      method: 'POST',
      headers: { Cookie: clientCookie },
      body: {
        reasonType: 'scope_or_plan_change',
        reasonDetails: 'Considering moving to May 21',
        proposedStart: '2027-05-21T08:00',
        proposedEnd: '2027-05-21T12:00',
      },
    })
    assert.equal(pendingRr.status, 201)

    // Gardener cancels due to accident/emergency -> 200 + pending reschedule auto-cancelled
    const gardenerCancel = await api(`/bookings/${bookingId}/status`, {
      method: 'PATCH',
      headers: { Cookie: gardenerCookie },
      body: {
        status: 'cancelled',
        cancellationReasonType: 'accident_emergency',
        cancellationReason: 'Minor motorcycle accident on the way to the site; unable to proceed safely.',
      },
    })
    assert.equal(gardenerCancel.status, 200)
    assert.equal(gardenerCancel.data.cancellation_reason_type, 'accident_emergency')
    assert.equal(gardenerCancel.data.cancelled_by, gardenerId)

    const detail = await api(`/bookings/${bookingId}`, { headers: { Cookie: clientCookie } })
    assert.equal(detail.status, 200)
    assert.equal(detail.data.booking.status, 'cancelled')
    assert.equal(detail.data.booking.cancellation_reason_type, 'accident_emergency')
    assert.equal(detail.data.rescheduleRequests[0].status, 'cancelled')

    // Slot 2027-05-20 08:00-12:00 is now free again! Client books it and then cancels due to typhoon
    const bookingId2 = await createApprovedBooking({
      start: '2027-05-20T08:00',
      end: '2027-05-20T12:00',
    })
    const clientCancel = await api(`/bookings/${bookingId2}/status`, {
      method: 'PATCH',
      headers: { Cookie: clientCookie },
      body: {
        status: 'cancelled',
        cancellationReasonType: 'typhoon_weather',
        cancellationReason: 'Flooding in barangay due to typhoon; cancelling yard service.',
      },
    })
    assert.equal(clientCancel.status, 200)
    assert.equal(clientCancel.data.cancelled_by, clientId)
    assert.equal(clientCancel.data.cancellation_reason_type, 'typhoon_weather')
  })
})
