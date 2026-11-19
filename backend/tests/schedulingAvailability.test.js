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
let clientACookie
let clientBCookie
let clientCCookie
let gardenerCookie
let gardenerId
let serviceId
let categoryId
const createdUserIds = []
const createdInquiryIds = []

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

async function createAndConfirmDirectBooking({ clientCookie, scheduledStart, scheduledEnd, estimatedWorkingDays = 0.5 }) {
  const prop = await api('/agreements/direct-service', {
    method: 'POST',
    headers: { Cookie: clientCookie },
    body: {
      serviceId,
      scopeOfWork: 'Scheduled maintenance test',
      amount: 1200,
      scheduledStart,
      scheduledEnd,
      estimatedWorkingDays,
      location: 'Tetuan, Zamboanga City',
    },
  })
  if (prop.status !== 201) return prop
  createdInquiryIds.push(prop.data.inquiryId)

  const agId = prop.data.agreement.id
  const cApp = await api(`/agreements/${agId}/approve`, {
    method: 'POST',
    headers: { Cookie: clientCookie },
    body: { version: 1 },
  })
  assert.equal(cApp.status, 200)

  const gApp = await api(`/agreements/${agId}/approve`, {
    method: 'POST',
    headers: { Cookie: gardenerCookie },
    body: { version: 1 },
  })
  return gApp
}

describe('Scheduling: Working Days, Working Hours, Unavailable Dates, Estimated Duration & Simultaneous Capacity', () => {
  const runId = Date.now()

  before(async () => {
    const [[dbRow]] = await pool.query('SELECT DATABASE() AS db')
    assert.equal(dbRow.db, 'hugatiera_db_migration_test', 'Must run against hugatiera_db_migration_test')

    server = http.createServer(app)
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    baseUrl = `http://127.0.0.1:${server.address().port}/api`

    const hash = await bcrypt.hash('Password123!', 10)
    for (const u of [
      { key: 'clientA', role: 'client', first: 'SchedA' },
      { key: 'clientB', role: 'client', first: 'SchedB' },
      { key: 'clientC', role: 'client', first: 'SchedC' },
      { key: 'gardener', role: 'gardener', first: 'SchedGardener' },
    ]) {
      const email = `sched.${u.key}.${runId}@hugatiera.test`
      const [ins] = await pool.execute(
        'INSERT INTO users (email, password_hash, role, first_name, last_name, phone, date_of_birth) VALUES (?, ?, ?, ?, "Test", "09171234567", "1993-04-04")',
        [email, hash, u.role, u.first],
      )
      createdUserIds.push(ins.insertId)
      if (u.role === 'client') {
        await pool.execute('INSERT INTO client_profiles (user_id, address, city) VALUES (?, "Tetuan", "Zamboanga City")', [ins.insertId])
      } else {
        gardenerId = ins.insertId
        await pool.execute('INSERT INTO gardener_profiles (user_id, business_name, is_approved) VALUES (?, "Schedule Pro", TRUE)', [ins.insertId])
      }

      const login = await api('/auth/login', { method: 'POST', body: { email, password: 'Password123!' } })
      assert.equal(login.status, 200)
      if (u.key === 'clientA') clientACookie = login.cookie
      if (u.key === 'clientB') clientBCookie = login.cookie
      if (u.key === 'clientC') clientCCookie = login.cookie
      if (u.key === 'gardener') gardenerCookie = login.cookie
    }

    const [cats] = await pool.execute('SELECT id FROM service_categories WHERE is_active = TRUE LIMIT 1')
    categoryId = cats[0].id
    const [svc] = await pool.execute(
      `INSERT INTO services (gardener_id, category_id, title, description, indicative_price, price_unit, service_area)
       VALUES (?, ?, 'Scheduled Maintenance', 'Reliable scheduled care', 1200.00, 'per visit', 'Zamboanga City')`,
      [gardenerId, categoryId],
    )
    serviceId = svc.insertId
  })

  after(async () => {
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

  it('enforces working days, working hours, and blocked/unavailable dates', async () => {
    // Gardener works Mon–Fri, 08:00–17:00, solo (1 job at a time)
    const updateRes = await api('/profiles/me', {
      method: 'PUT',
      headers: { Cookie: gardenerCookie },
      body: {
        firstName: 'SchedGardener',
        lastName: 'Test',
        phone: '09171234567',
        businessName: 'Schedule Pro',
        serviceArea: 'Zamboanga City',
        workingDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
        workStartTime: '08:00',
        workEndTime: '17:00',
        maxConcurrentJobs: 1,
        availabilityNotes: 'Weekdays only, 8 AM to 5 PM.',
      },
    })
    assert.equal(updateRes.status, 200)
    assert.equal(updateRes.data.profile.working_days, 'mon,tue,wed,thu,fri')
    assert.equal(updateRes.data.profile.max_concurrent_jobs, 1)

    // 2027-03-07 is a Sunday -> must reject with 409 OUTSIDE_WORKING_DAYS
    const sundayAttempt = await api('/agreements/direct-service', {
      method: 'POST',
      headers: { Cookie: clientACookie },
      body: {
        serviceId,
        scopeOfWork: 'Sunday cleanup',
        amount: 1200,
        scheduledStart: '2027-03-07T09:00',
        scheduledEnd: '2027-03-07T11:00',
        location: 'Tetuan, Zamboanga City',
      },
    })
    assert.equal(sundayAttempt.status, 409)
    assert.equal(sundayAttempt.data.code, 'OUTSIDE_WORKING_DAYS')

    // 2027-03-08 is a Monday, but 16:00–18:30 exceeds 17:00 -> 409 OUTSIDE_WORKING_HOURS
    const afterHoursAttempt = await api('/agreements/direct-service', {
      method: 'POST',
      headers: { Cookie: clientACookie },
      body: {
        serviceId,
        scopeOfWork: 'Evening cleanup',
        amount: 1200,
        scheduledStart: '2027-03-08T16:00',
        scheduledEnd: '2027-03-08T18:30',
        location: 'Tetuan, Zamboanga City',
      },
    })
    assert.equal(afterHoursAttempt.status, 409)
    assert.equal(afterHoursAttempt.data.code, 'OUTSIDE_WORKING_HOURS')

    // Gardener blocks 2027-03-10 to 2027-03-12 (Wed–Fri)
    const blockRes = await api('/profiles/me/unavailable-dates', {
      method: 'POST',
      headers: { Cookie: gardenerCookie },
      body: { startDate: '2027-03-10', endDate: '2027-03-12', reason: 'Off-platform landscaping project' },
    })
    assert.equal(blockRes.status, 201)
    const blockId = blockRes.data.id

    // Live check on blocked date returns available=false GARDENER_UNAVAILABLE
    const checkBlocked = await api(`/gardeners/${gardenerId}/availability/check`, {
      method: 'POST',
      body: { scheduledStart: '2027-03-11T09:00', scheduledEnd: '2027-03-11T12:00' },
    })
    assert.equal(checkBlocked.status, 200)
    assert.equal(checkBlocked.data.available, false)
    assert.equal(checkBlocked.data.code, 'GARDENER_UNAVAILABLE')

    // Proposal on blocked date fails with 409 GARDENER_UNAVAILABLE
    const blockedAttempt = await api('/agreements/direct-service', {
      method: 'POST',
      headers: { Cookie: clientACookie },
      body: {
        serviceId,
        scopeOfWork: 'Blocked date test',
        amount: 1200,
        scheduledStart: '2027-03-11T09:00',
        scheduledEnd: '2027-03-11T12:00',
        location: 'Tetuan, Zamboanga City',
      },
    })
    assert.equal(blockedAttempt.status, 409)
    assert.equal(blockedAttempt.data.code, 'GARDENER_UNAVAILABLE')

    // Remove unavailable date -> now available
    const delBlock = await api(`/profiles/me/unavailable-dates/${blockId}`, {
      method: 'DELETE',
      headers: { Cookie: gardenerCookie },
    })
    assert.equal(delBlock.status, 204)

    const checkAfterUnblock = await api(`/gardeners/${gardenerId}/availability/check`, {
      method: 'POST',
      body: { scheduledStart: '2027-03-11T09:00', scheduledEnd: '2027-03-11T12:00' },
    })
    assert.equal(checkAfterUnblock.status, 200)
    assert.equal(checkAfterUnblock.data.available, true)
  })

  it('allows overlapping bookings up to maxConcurrentJobs without conflict and blocks exceeding capacity using exact peak overlap', async () => {
    // Gardener notes they have a 2-person crew (maxConcurrentJobs = 2)
    const updateCap = await api('/profiles/me', {
      method: 'PUT',
      headers: { Cookie: gardenerCookie },
      body: {
        firstName: 'SchedGardener',
        lastName: 'Test',
        phone: '09171234567',
        businessName: 'Schedule Pro',
        serviceArea: 'Zamboanga City',
        workingDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
        workStartTime: '08:00',
        workEndTime: '17:00',
        maxConcurrentJobs: 2,
        availabilityNotes: '2-person crew can handle 2 jobs simultaneously.',
      },
    })
    assert.equal(updateCap.status, 200)
    assert.equal(updateCap.data.profile.max_concurrent_jobs, 2)

    // 2027-03-15 is a Monday
    // Booking 1: 08:00–12:00 (Client A) -> Confirmed (slot 1/2)
    const b1 = await createAndConfirmDirectBooking({
      clientCookie: clientACookie,
      scheduledStart: '2027-03-15T08:00',
      scheduledEnd: '2027-03-15T12:00',
      estimatedWorkingDays: 0.5,
    })
    assert.equal(b1.status, 200)
    assert.equal(b1.data.confirmed, true)

    // Booking 2: 10:00–14:00 (Client B, overlaps Booking 1 from 10:00–12:00) -> Confirmed! (slot 2/2, no conflict!)
    const b2 = await createAndConfirmDirectBooking({
      clientCookie: clientBCookie,
      scheduledStart: '2027-03-15T10:00',
      scheduledEnd: '2027-03-15T14:00',
      estimatedWorkingDays: 0.5,
    })
    assert.equal(b2.status, 200)
    assert.equal(b2.data.confirmed, true)

    // Booking 3 attempt: 11:00–13:00 (Client C, peak overlap 11:00–12:00 would be 3 > 2) -> 409 SCHEDULE_CONFLICT!
    const b3Conflict = await api('/agreements/direct-service', {
      method: 'POST',
      headers: { Cookie: clientCCookie },
      body: {
        serviceId,
        scopeOfWork: 'Exceeds 2 simultaneous slots',
        amount: 1200,
        scheduledStart: '2027-03-15T11:00',
        scheduledEnd: '2027-03-15T13:00',
        location: 'Tetuan, Zamboanga City',
      },
    })
    assert.equal(b3Conflict.status, 409)
    assert.equal(b3Conflict.data.code, 'SCHEDULE_CONFLICT')

    // Booking 3 non-peak attempt: 12:00–16:00 (overlaps ONLY Booking 2 from 12:00–14:00 since Booking 1 ended at 12:00 -> peak = 2 <= 2!) -> SUCCEEDS!
    const b3Ok = await createAndConfirmDirectBooking({
      clientCookie: clientCCookie,
      scheduledStart: '2027-03-15T12:00',
      scheduledEnd: '2027-03-15T16:00',
      estimatedWorkingDays: 0.5,
    })
    assert.equal(b3Ok.status, 200)
    assert.equal(b3Ok.data.confirmed, true)
    assert.equal(Number(b3Ok.data.agreement.estimated_working_days), 0.5)

    // Gardener cannot block a date that already has confirmed bookings
    const blockOverBooking = await api('/profiles/me/unavailable-dates', {
      method: 'POST',
      headers: { Cookie: gardenerCookie },
      body: { startDate: '2027-03-15', endDate: '2027-03-15', reason: 'Trying to block booked day' },
    })
    assert.equal(blockOverBooking.status, 409)

    // Public availability endpoint exposes anonymized busy slots & schedule settings without leaking client names
    const availRes = await api(`/gardeners/${gardenerId}/availability`)
    assert.equal(availRes.status, 200)
    assert.equal(availRes.data.availability.maxConcurrentJobs, 2)
    assert.ok(availRes.data.availability.busySlots.length >= 3)
    assert.equal(availRes.data.availability.busySlots[0].client_name, undefined)
  })
})
