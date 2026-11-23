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
let adminCookie
let categoryId
let dualUserId
let dualCookie
let dualServiceId
let singleClientId
let singleClientCookie
let clerkUserId
let clerkCookie
let gardenerAId
let gardenerACookie
let gardenerBId
let gardenerBCookie
let assignmentId
let gardenerABookingId
let gardenerAPaymentId
let gardenerBBookingId
let gardenerBPaymentId
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

async function seedUser({ email, password, role, firstName, lastName, approvedGardener = false }) {
  const hash = await bcrypt.hash(password, 10)
  const canClient = role === 'client' ? 1 : 0
  const canGardener = role === 'gardener' ? 1 : 0
  const [res] = await pool.execute(
    `INSERT INTO users (email, password_hash, role, can_act_as_client, can_act_as_gardener, first_name, last_name, phone, date_of_birth)
     VALUES (?, ?, ?, ?, ?, ?, ?, '09171234567', '1992-05-10')`,
    [email, hash, role, canClient, canGardener, firstName, lastName],
  )
  const userId = res.insertId
  createdUserIds.push(userId)

  if (role === 'client') {
    await pool.execute('INSERT INTO client_profiles (user_id, address, city) VALUES (?, ?, ?)', [userId, 'Brgy. Tetuan', 'Zamboanga City'])
  } else if (role === 'gardener') {
    await pool.execute(
      `INSERT INTO gardener_profiles (user_id, business_name, service_area, years_of_experience, is_approved)
       VALUES (?, ?, 'Zamboanga City', 5, ?)`,
      [userId, `${firstName} Gardens`, approvedGardener ? 1 : 0],
    )
  }

  const loginRes = await api('/auth/login', {
    method: 'POST',
    body: { email, password },
  })
  assert.equal(loginRes.status, 200)
  return { userId, cookie: loginRes.cookie }
}

describe('Step 2 (Migration 012): Dual Role (Client + Gardener) & Assigned Clerk Role', () => {
  before(async () => {
    server = http.createServer(app)
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const { port } = server.address()
    baseUrl = `http://127.0.0.1:${port}/api`

    const [catRows] = await pool.query('SELECT id FROM service_categories WHERE is_active = TRUE ORDER BY id ASC LIMIT 1')
    assert.ok(catRows[0], 'Expected at least one active service category')
    categoryId = catRows[0].id

    const stamp = Date.now()
    const admin = await seedUser({
      email: `dual_admin_${stamp}@test.local`,
      password: 'Password123!',
      role: 'administrator',
      firstName: 'Admin',
      lastName: 'Tester',
    })
    adminCookie = admin.cookie

    const singleClient = await seedUser({
      email: `dual_single_${stamp}@test.local`,
      password: 'Password123!',
      role: 'client',
      firstName: 'Single',
      lastName: 'Client',
    })
    singleClientId = singleClient.userId
    singleClientCookie = singleClient.cookie

    const clerk = await seedUser({
      email: `clerk_user_${stamp}@test.local`,
      password: 'Password123!',
      role: 'client',
      firstName: 'Carlo',
      lastName: 'Clerk',
    })
    clerkUserId = clerk.userId

    const gA = await seedUser({
      email: `gardener_a_${stamp}@test.local`,
      password: 'Password123!',
      role: 'gardener',
      firstName: 'Alpha',
      lastName: 'Gardener',
      approvedGardener: true,
    })
    gardenerAId = gA.userId
    gardenerACookie = gA.cookie

    const gB = await seedUser({
      email: `gardener_b_${stamp}@test.local`,
      password: 'Password123!',
      role: 'gardener',
      firstName: 'Beta',
      lastName: 'Gardener',
      approvedGardener: true,
    })
    gardenerBId = gB.userId
    gardenerBCookie = gB.cookie
  })

  after(async () => {
    try {
      if (createdInquiryIds.length > 0) {
        const inqPlaceholders = createdInquiryIds.map(() => '?').join(', ')
        const [bRows] = await pool.query(`SELECT id FROM bookings WHERE inquiry_id IN (${inqPlaceholders})`, createdInquiryIds)
        const bIds = bRows.map((r) => r.id)
        if (bIds.length > 0) {
          const bPh = bIds.map(() => '?').join(', ')
          await pool.query(`DELETE FROM reviews WHERE booking_id IN (${bPh})`, bIds)
          await pool.query(`DELETE FROM booking_payments WHERE booking_id IN (${bPh})`, bIds)
          await pool.query(`DELETE FROM booking_reschedule_requests WHERE booking_id IN (${bPh})`, bIds)
          await pool.query(`DELETE FROM bookings WHERE id IN (${bPh})`, bIds)
        }
        await pool.query(`DELETE FROM agreements WHERE inquiry_id IN (${inqPlaceholders})`, createdInquiryIds)
        await pool.query(`DELETE FROM quotations WHERE inquiry_id IN (${inqPlaceholders})`, createdInquiryIds)
        await pool.query(`DELETE FROM inquiries WHERE id IN (${inqPlaceholders})`, createdInquiryIds)
      }

      if (createdUserIds.length > 0) {
        const uPh = createdUserIds.map(() => '?').join(', ')
        await pool.query(`DELETE FROM clerk_gardener_assignments WHERE clerk_id IN (${uPh}) OR gardener_id IN (${uPh})`, [...createdUserIds, ...createdUserIds])
        await pool.query(`DELETE FROM notifications WHERE user_id IN (${uPh})`, createdUserIds)
        await pool.query(`DELETE FROM gardener_unavailable_dates WHERE gardener_id IN (${uPh})`, createdUserIds)
        const [bRows2] = await pool.query(`SELECT id FROM bookings WHERE client_id IN (${uPh}) OR gardener_id IN (${uPh})`, [...createdUserIds, ...createdUserIds])
        if (bRows2.length > 0) {
          const bPh2 = bRows2.map(() => '?').join(', ')
          const bIds2 = bRows2.map((r) => r.id)
          await pool.query(`DELETE FROM reviews WHERE booking_id IN (${bPh2})`, bIds2)
          await pool.query(`DELETE FROM booking_payments WHERE booking_id IN (${bPh2})`, bIds2)
          await pool.query(`DELETE FROM bookings WHERE id IN (${bPh2})`, bIds2)
        }
        await pool.query(`DELETE FROM services WHERE gardener_id IN (${uPh})`, createdUserIds)
        await pool.query(`DELETE FROM gardener_profiles WHERE user_id IN (${uPh})`, createdUserIds)
        await pool.query(`DELETE FROM client_profiles WHERE user_id IN (${uPh})`, createdUserIds)
        await pool.query(`DELETE FROM users WHERE id IN (${uPh})`, createdUserIds)
      }
    } finally {
      if (server) await new Promise((resolve) => server.close(resolve))
      await pool.end()
    }
  })

  it('rejects public registration with role="clerk"', async () => {
    const res = await api('/auth/register', {
      method: 'POST',
      body: {
        role: 'clerk',
        firstName: 'Sneaky',
        lastName: 'Clerk',
        dateOfBirth: '1995-01-01',
        phone: '09171112222',
        email: `sneaky_clerk_${Date.now()}@test.local`,
        password: 'Password123!',
        confirmPassword: 'Password123!',
      },
    })
    assert.equal(res.status, 400)
  })

  it('registers a dual-role ("both") user, switches roles, keeps approved service public, and prevents self-dealing', async () => {
    const stamp = Date.now()
    const reg = await api('/auth/register', {
      method: 'POST',
      body: {
        role: 'both',
        firstName: 'Maya',
        lastName: 'Dual',
        dateOfBirth: '1993-06-15',
        phone: '09179876543',
        address: 'Brgy. Tumaga',
        city: 'Zamboanga City',
        businessName: 'Maya Dual Gardens',
        serviceArea: 'Zamboanga City',
        yearsOfExperience: 4,
        description: 'Client and landscaping specialist',
        email: `maya_dual_${stamp}@test.local`,
        password: 'Password123!',
        confirmPassword: 'Password123!',
      },
    })
    assert.equal(reg.status, 201, `Expected 201 got ${reg.status}: ${JSON.stringify(reg.data)}`)
    assert.equal(reg.data.user.role, 'client')
    assert.equal(reg.data.user.canActAsClient, true)
    assert.equal(reg.data.user.canActAsGardener, true)
    assert.equal(reg.data.user.isDualRole, true)
    dualUserId = reg.data.user.id
    dualCookie = reg.cookie
    createdUserIds.push(dualUserId)

    // Switch to gardener mode
    const toGardener = await api('/auth/switch-role', {
      method: 'POST',
      headers: { Cookie: dualCookie },
      body: { targetRole: 'gardener' },
    })
    assert.equal(toGardener.status, 200)
    assert.equal(toGardener.data.user.role, 'gardener')
    dualCookie = toGardener.cookie || dualCookie

    // Admin approves dual user's gardener profile
    const approve = await api(`/admin/gardeners/${dualUserId}/approval`, {
      method: 'PATCH',
      headers: { Cookie: adminCookie },
      body: { isApproved: true },
    })
    assert.equal(approve.status, 200)

    // Create a service as dual user in gardener mode
    const svcRes = await api('/services', {
      method: 'POST',
      headers: { Cookie: dualCookie },
      body: {
        title: `Dual Role Lawn Care ${stamp}`,
        description: 'Professional lawn maintenance offered by a dual-role account.',
        categoryId,
        indicativePrice: 1500,
        priceUnit: 'per visit',
        serviceArea: 'Zamboanga City',
        workersRequired: 1,
      },
    })
    assert.equal(svcRes.status, 201)
    dualServiceId = svcRes.data.id

    // Switch back to client mode
    const toClient = await api('/auth/switch-role', {
      method: 'POST',
      headers: { Cookie: dualCookie },
      body: { targetRole: 'client' },
    })
    assert.equal(toClient.status, 200)
    assert.equal(toClient.data.user.role, 'client')
    dualCookie = toClient.cookie || dualCookie

    // Service must STILL appear publicly even while owner is currently in client mode
    const publicList = await api('/services')
    assert.equal(publicList.status, 200)
    assert.ok(
      publicList.data.services.some((s) => s.id === dualServiceId),
      'Dual-role gardener service should stay visible publicly even when owner is in Client mode',
    )

    // Self-dealing check 1: direct inquiry to self must fail with 409
    const selfInq = await api('/inquiries', {
      method: 'POST',
      headers: { Cookie: dualCookie },
      body: {
        requestType: 'direct',
        gardenerId: dualUserId,
        serviceId: dualServiceId,
        categoryId,
        subject: 'Self inquiry attempt',
        description: 'Trying to inquire on my own service',
        location: 'Zamboanga City',
      },
    })
    assert.equal(selfInq.status, 409)
    assert.equal(selfInq.data.code, 'SELF_INQUIRY_FORBIDDEN')

    // Self-dealing check 2: direct-service booking to self must fail with 409
    const selfBook = await api('/agreements/direct-service', {
      method: 'POST',
      headers: { Cookie: dualCookie },
      body: {
        serviceId: dualServiceId,
        scopeOfWork: 'Self booking attempt',
        amount: 1500,
        scheduledStart: '2026-12-10 09:00:00',
        scheduledEnd: '2026-12-10 12:00:00',
        location: 'Zamboanga City',
      },
    })
    assert.equal(selfBook.status, 409)
    assert.equal(selfBook.data.code, 'SELF_BOOKING_FORBIDDEN')

    // Self-dealing check 3: post general request in client mode, switch to gardener, try sending offer on own request -> 409
    const openReq = await api('/inquiries', {
      method: 'POST',
      headers: { Cookie: dualCookie },
      body: {
        requestType: 'general',
        categoryId,
        subject: 'Need garden cleanup',
        description: 'General request posted by dual-role user in client mode',
        location: 'Tetuan, Zamboanga City',
      },
    })
    assert.equal(openReq.status, 201)
    createdInquiryIds.push(openReq.data.id)

    const backToGardener = await api('/auth/switch-role', {
      method: 'POST',
      headers: { Cookie: dualCookie },
      body: { targetRole: 'gardener' },
    })
    assert.equal(backToGardener.status, 200)
    dualCookie = backToGardener.cookie || dualCookie

    const selfOffer = await api(`/inquiries/${openReq.data.id}/quotations`, {
      method: 'POST',
      headers: { Cookie: dualCookie },
      body: {
        amount: 1800,
        details: 'Trying to quote my own open request',
      },
    })
    assert.equal(selfOffer.status, 409)
    assert.equal(selfOffer.data.code, 'SELF_OFFER_FORBIDDEN')
  })

  it('allows an existing single-role client to opt into dual role and switch to gardener mode', async () => {
    const enableRes = await api('/auth/enable-dual-role', {
      method: 'POST',
      headers: { Cookie: singleClientCookie },
      body: {
        businessName: 'Single Turned Dual Landscaping',
        serviceArea: 'Zamboanga City',
      },
    })
    assert.equal(enableRes.status, 200)
    assert.equal(enableRes.data.user.isDualRole, true)
    assert.equal(enableRes.data.user.canActAsGardener, true)

    const sw = await api('/auth/switch-role', {
      method: 'POST',
      headers: { Cookie: singleClientCookie },
      body: { targetRole: 'gardener' },
    })
    assert.equal(sw.status, 200)
    assert.equal(sw.data.user.role, 'gardener')
    singleClientCookie = sw.cookie || singleClientCookie
  })

  it('enforces Assigned Clerk scoping: full schedule/service/payment access for Gardener A, 403 for unassigned Gardener B', async () => {
    // 1. Admin changes clerkUserId role to 'clerk'
    const promote = await api(`/admin/users/${clerkUserId}`, {
      method: 'PATCH',
      headers: { Cookie: adminCookie },
      body: {
        firstName: 'Carlo',
        lastName: 'Clerk',
        phone: '09171234567',
        role: 'clerk',
        isActive: true,
      },
    })
    assert.equal(promote.status, 200)
    assert.equal(promote.data.user.role, 'clerk')

    // Re-login as clerk to get fresh clerk JWT cookie
    const clerkRows = await pool.query('SELECT email FROM users WHERE id = ?', [clerkUserId])
    const clerkLogin = await api('/auth/login', {
      method: 'POST',
      body: { email: clerkRows[0][0].email, password: 'Password123!' },
    })
    assert.equal(clerkLogin.status, 200)
    assert.equal(clerkLogin.data.user.role, 'clerk')
    clerkCookie = clerkLogin.cookie

    // 2. Admin assigns clerk ONLY to Gardener A
    const assign = await api('/admin/clerk-assignments', {
      method: 'POST',
      headers: { Cookie: adminCookie },
      body: {
        clerkId: clerkUserId,
        gardenerId: gardenerAId,
        notes: 'Assigned to manage Alpha Gardens',
      },
    })
    assert.equal(assign.status, 201)
    assignmentId = assign.data.id

    // Verify assignment list returns it
    const listAssign = await api('/admin/clerk-assignments', {
      headers: { Cookie: adminCookie },
    })
    assert.equal(listAssign.status, 200)
    assert.ok(listAssign.data.assignments.some((a) => a.id === assignmentId))

    // 3. Clerk workspace returns ONLY Gardener A
    const ws = await api('/clerk/workspace', { headers: { Cookie: clerkCookie } })
    assert.equal(ws.status, 200)
    assert.equal(ws.data.gardeners.length, 1)
    assert.equal(ws.data.gardeners[0].id, gardenerAId)

    // 4. Clerk updates Gardener A schedule & crew size -> 200
    const updSchedA = await api(`/clerk/gardeners/${gardenerAId}/schedule`, {
      method: 'PUT',
      headers: { Cookie: clerkCookie },
      body: {
        workingDays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
        workStartTime: '07:30',
        workEndTime: '17:30',
        maxConcurrentJobs: 2,
        crewSize: 5,
        availabilityNotes: 'Managed by Clerk Carlo',
      },
    })
    assert.equal(updSchedA.status, 200)
    assert.equal(updSchedA.data.crewSize, 5)

    // Clerk tries updating Gardener B schedule -> 403
    const updSchedB = await api(`/clerk/gardeners/${gardenerBId}/schedule`, {
      method: 'PUT',
      headers: { Cookie: clerkCookie },
      body: {
        workingDays: ['mon', 'tue'],
        workStartTime: '08:00',
        workEndTime: '17:00',
        maxConcurrentJobs: 1,
        crewSize: 2,
      },
    })
    assert.equal(updSchedB.status, 403)
    assert.equal(updSchedB.data.code, 'NOT_ASSIGNED_TO_GARDENER')

    // 5. Clerk creates & toggles service for Gardener A -> 201/200; Gardener B -> 403
    const svcA = await api(`/clerk/gardeners/${gardenerAId}/services`, {
      method: 'POST',
      headers: { Cookie: clerkCookie },
      body: {
        title: 'Clerk-Managed Hedge Trimming',
        description: 'Scheduled hedge trimming created by assigned clerk.',
        categoryId,
        indicativePrice: 1200,
        priceUnit: 'per visit',
        serviceArea: 'Zamboanga City',
        workersRequired: 2,
      },
    })
    assert.equal(svcA.status, 201)

    const toggleA = await api(`/clerk/gardeners/${gardenerAId}/services/${svcA.data.id}/status`, {
      method: 'PATCH',
      headers: { Cookie: clerkCookie },
      body: { isActive: false },
    })
    assert.equal(toggleA.status, 200)
    assert.equal(toggleA.data.isActive, false)

    const svcB = await api(`/clerk/gardeners/${gardenerBId}/services`, {
      method: 'POST',
      headers: { Cookie: clerkCookie },
      body: {
        title: 'Unauthorized Service',
        description: 'Should be rejected.',
        categoryId,
      },
    })
    assert.equal(svcB.status, 403)

    // 6. Seed bookings & pending payments for Gardener A and Gardener B to test clerk payment verification
    const [bAIns] = await pool.execute(
      `INSERT INTO bookings (client_id, gardener_id, scheduled_start, scheduled_end, location, status, booking_stage, payment_status, required_deposit_amount, amount_paid)
       VALUES (?, ?, '2026-12-15 08:00:00', '2026-12-15 12:00:00', 'Tetuan', 'accepted', 'reserved', 'pending_verification', 500.00, 0.00)`,
      [singleClientId, gardenerAId],
    )
    gardenerABookingId = bAIns.insertId
    const [pAIns] = await pool.execute(
      `INSERT INTO booking_payments (transaction_code, booking_id, submitted_by, payment_type, payment_method, amount, reference_number, status)
       VALUES ('TXN-20261215-CLKA01', ?, ?, 'deposit', 'gcash', 500.00, 'GCASH-111', 'pending')`,
      [gardenerABookingId, singleClientId],
    )
    gardenerAPaymentId = pAIns.insertId

    const [bBIns] = await pool.execute(
      `INSERT INTO bookings (client_id, gardener_id, scheduled_start, scheduled_end, location, status, booking_stage, payment_status, required_deposit_amount, amount_paid)
       VALUES (?, ?, '2026-12-16 08:00:00', '2026-12-16 12:00:00', 'Guiwan', 'accepted', 'reserved', 'pending_verification', 500.00, 0.00)`,
      [singleClientId, gardenerBId],
    )
    gardenerBBookingId = bBIns.insertId
    const [pBIns] = await pool.execute(
      `INSERT INTO booking_payments (transaction_code, booking_id, submitted_by, payment_type, payment_method, amount, reference_number, status)
       VALUES ('TXN-20261216-CLKB01', ?, ?, 'deposit', 'gcash', 500.00, 'GCASH-222', 'pending')`,
      [gardenerBBookingId, singleClientId],
    )
    gardenerBPaymentId = pBIns.insertId

    // Clerk verifies Gardener A's pending payment -> 200 & upgrades booking_stage to 'booked'
    const verifyA = await api(`/clerk/gardeners/${gardenerAId}/bookings/${gardenerABookingId}/payments/${gardenerAPaymentId}`, {
      method: 'PATCH',
      headers: { Cookie: clerkCookie },
      body: { decision: 'verified' },
    })
    assert.equal(verifyA.status, 200)
    assert.equal(verifyA.data.booking.booking_stage, 'booked')
    assert.equal(verifyA.data.booking.amount_paid, 500)

    // Clerk attempts to verify Gardener B's payment -> 403
    const verifyB = await api(`/clerk/gardeners/${gardenerBId}/bookings/${gardenerBBookingId}/payments/${gardenerBPaymentId}`, {
      method: 'PATCH',
      headers: { Cookie: clerkCookie },
      body: { decision: 'verified' },
    })
    assert.equal(verifyB.status, 403)
    assert.equal(verifyB.data.code, 'NOT_ASSIGNED_TO_GARDENER')

    // 7. Admin unassigns Clerk from Gardener A -> Clerk immediately loses access (403)
    const unassign = await api(`/admin/clerk-assignments/${assignmentId}`, {
      method: 'DELETE',
      headers: { Cookie: adminCookie },
    })
    assert.equal(unassign.status, 204)

    const afterUnassign = await api(`/clerk/gardeners/${gardenerAId}/schedule`, {
      method: 'PUT',
      headers: { Cookie: clerkCookie },
      body: {
        workingDays: ['mon'],
        workStartTime: '08:00',
        workEndTime: '17:00',
        maxConcurrentJobs: 1,
        crewSize: 1,
      },
    })
    assert.equal(afterUnassign.status, 403)
  })

  it('allows a gardener to self-create, list, and revoke their own clerk, while blocking non-clerk email hijacking', async () => {
    const stamp = Date.now()
    const clerkEmail = `self_clerk_${stamp}@test.local`

    // 1. Gardener A creates a new clerk account directly for themselves
    const createRes = await api('/profiles/me/clerks', {
      method: 'POST',
      headers: { Cookie: gardenerACookie },
      body: {
        firstName: 'Nina',
        lastName: 'Desk',
        email: clerkEmail,
        phone: '09178889999',
        password: 'ClerkPassword123!',
        notes: 'Handles Alpha Gardens bookings',
      },
    })
    assert.equal(createRes.status, 201, `Expected 201 got ${createRes.status}: ${JSON.stringify(createRes.data)}`)
    const selfClerkId = createRes.data.clerk.clerk_id
    const selfAssignmentId = createRes.data.assignmentId
    createdUserIds.push(selfClerkId)

    // 2. Gardener A sees the clerk in GET /profiles/me/clerks
    const listRes = await api('/profiles/me/clerks', { headers: { Cookie: gardenerACookie } })
    assert.equal(listRes.status, 200)
    assert.ok(listRes.data.clerks.some((c) => c.assignment_id === selfAssignmentId))

    // 3. New clerk logs in and can manage Gardener A (but NOT Gardener B)
    const loginRes = await api('/auth/login', {
      method: 'POST',
      body: { email: clerkEmail, password: 'ClerkPassword123!' },
    })
    assert.equal(loginRes.status, 200)
    assert.equal(loginRes.data.user.role, 'clerk')

    const wsRes = await api('/clerk/workspace', { headers: { Cookie: loginRes.cookie } })
    assert.equal(wsRes.status, 200)
    assert.equal(wsRes.data.gardeners.length, 1)
    assert.equal(wsRes.data.gardeners[0].id, gardenerAId)

    // 4. Attempting to link a non-clerk (e.g., Gardener B's email) via /assign is rejected with 400 TARGET_NOT_CLERK
    const [gBRows] = await pool.query('SELECT email FROM users WHERE id = ?', [gardenerBId])
    const hijackTry = await api('/profiles/me/clerks/assign', {
      method: 'POST',
      headers: { Cookie: gardenerACookie },
      body: { email: gBRows[0].email },
    })
    assert.equal(hijackTry.status, 400)
    assert.equal(hijackTry.data.code, 'TARGET_NOT_CLERK')

    // 5. Gardener B cannot revoke Gardener A's clerk assignment (404)
    const wrongRevoke = await api(`/profiles/me/clerks/${selfAssignmentId}`, {
      method: 'DELETE',
      headers: { Cookie: gardenerBCookie },
    })
    assert.equal(wrongRevoke.status, 404)

    // 6. Gardener A revokes their clerk -> 204, and clerk loses access immediately (403)
    const revokeRes = await api(`/profiles/me/clerks/${selfAssignmentId}`, {
      method: 'DELETE',
      headers: { Cookie: gardenerACookie },
    })
    assert.equal(revokeRes.status, 204)

    const afterRevoke = await api(`/clerk/gardeners/${gardenerAId}/schedule`, {
      method: 'PUT',
      headers: { Cookie: loginRes.cookie },
      body: { workingDays: ['mon'], workStartTime: '08:00', workEndTime: '17:00', maxConcurrentJobs: 1, crewSize: 1 },
    })
    assert.equal(afterRevoke.status, 403)
  })
})
