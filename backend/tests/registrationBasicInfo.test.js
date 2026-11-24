const path = require('node:path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-suite'
const { after, before, describe, it } = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const bcrypt = require('bcryptjs')
const app = require('../app')
const { pool } = require('../config/database')

let server
let baseUrl
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

function isoDateYearsAgo(yearsAgo, dayOffset = 0) {
  const date = new Date()
  date.setFullYear(date.getFullYear() - yearsAgo)
  date.setDate(date.getDate() + dayOffset)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

describe('Registration Basic Info, Optional Middle Name & 18+ Birthday Validation', () => {
  const runId = Date.now()

  before(async () => {
    const [[dbRow]] = await pool.query('SELECT DATABASE() AS db')
    assert.equal(dbRow.db, 'hugatiera_db_migration_test', 'Must run against hugatiera_db_migration_test')

    server = http.createServer(app)
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    baseUrl = `http://127.0.0.1:${server.address().port}/api`
  })

  after(async () => {
    if (createdUserIds.length > 0) {
      await pool.query('DELETE FROM users WHERE id IN (?)', [createdUserIds])
    }
    if (server) await new Promise((resolve) => server.close(resolve))
    await pool.end()
  })

  it('rejects underage, future, invalid birthday, bad mobile number, password mismatch, and missing client address', async () => {
    const basePayload = {
      firstName: 'Ana',
      middleName: 'Reyes',
      lastName: 'Cruz',
      dateOfBirth: isoDateYearsAgo(22),
      phone: '09171234567',
      address: '123 Pasonanca Rd',
      city: 'Zamboanga City',
      email: `reg.reject.${runId}@hugatiera.test`,
      password: 'Password123!',
      confirmPassword: 'Password123!',
      role: 'client',
    }

    // 17 years old (1 day shy of 18) -> 400
    const underage = await api('/auth/register', {
      method: 'POST',
      body: { ...basePayload, dateOfBirth: isoDateYearsAgo(18, 1) },
    })
    assert.equal(underage.status, 400)
    assert.match(underage.data.message, /18/)

    // Future date -> 400
    const futureDob = await api('/auth/register', {
      method: 'POST',
      body: { ...basePayload, dateOfBirth: isoDateYearsAgo(-1) },
    })
    assert.equal(futureDob.status, 400)

    // Invalid calendar date -> 400
    const invalidCalendar = await api('/auth/register', {
      method: 'POST',
      body: { ...basePayload, dateOfBirth: '2000-02-30' },
    })
    assert.equal(invalidCalendar.status, 400)

    // Missing birthday -> 400
    const missingDob = await api('/auth/register', {
      method: 'POST',
      body: { ...basePayload, dateOfBirth: '' },
    })
    assert.equal(missingDob.status, 400)

    // Invalid mobile number (< 10 digits) -> 400
    const shortPhone = await api('/auth/register', {
      method: 'POST',
      body: { ...basePayload, phone: '12345' },
    })
    assert.equal(shortPhone.status, 400)

    // Password mismatch -> 400
    const mismatch = await api('/auth/register', {
      method: 'POST',
      body: { ...basePayload, confirmPassword: 'DifferentPassword1!' },
    })
    assert.equal(mismatch.status, 400)
    assert.match(mismatch.data.message, /match/i)

    // Missing client street/barangay address -> 400
    const missingAddress = await api('/auth/register', {
      method: 'POST',
      body: { ...basePayload, address: '' },
    })
    assert.equal(missingAddress.status, 400)
  })

  it('registers an exact 18-year-old client with optional middle name and persists address/city', async () => {
    const exact18Dob = isoDateYearsAgo(18, 0)
    const res = await api('/auth/register', {
      method: 'POST',
      body: {
        firstName: 'Liza',
        middleName: 'Dela',
        lastName: 'Cruz',
        dateOfBirth: exact18Dob,
        phone: '+63 917 555 0199',
        address: '45 Tumaga Rd, Brgy. Tumaga',
        city: 'Zamboanga City',
        email: `reg.client18.${runId}@hugatiera.test`,
        password: 'Password123!',
        confirmPassword: 'Password123!',
        role: 'client',
      },
    })
    assert.equal(res.status, 201, `Unexpected response: ${JSON.stringify(res.data)}`)
    createdUserIds.push(res.data.user.id)
    assert.equal(res.data.user.middleName, 'Dela')
    assert.equal(res.data.user.fullName, 'Liza Dela Cruz')
    assert.equal(res.data.user.dateOfBirth, exact18Dob)
    assert.equal(res.data.user.age, 18)

    const profileRes = await api('/profiles/me', { headers: { Cookie: res.cookie } })
    assert.equal(profileRes.status, 200)
    assert.equal(profileRes.data.user.middleName, 'Dela')
    assert.equal(profileRes.data.user.dateOfBirth, exact18Dob)
    assert.equal(profileRes.data.user.age, 18)
    assert.equal(profileRes.data.profile.address, '45 Tumaga Rd, Brgy. Tumaga')
    assert.equal(profileRes.data.profile.city, 'Zamboanga City')

    // Clearing optional middleName and rejecting underage update on PUT /api/profiles/me
    const underageUpdate = await api('/profiles/me', {
      method: 'PUT',
      headers: { Cookie: res.cookie },
      body: {
        firstName: 'Liza',
        middleName: '',
        lastName: 'Cruz',
        phone: '+63 917 555 0199',
        dateOfBirth: isoDateYearsAgo(16),
        address: '45 Tumaga Rd, Brgy. Tumaga',
        city: 'Zamboanga City',
      },
    })
    assert.equal(underageUpdate.status, 400)

    const clearMiddle = await api('/profiles/me', {
      method: 'PUT',
      headers: { Cookie: res.cookie },
      body: {
        firstName: 'Liza',
        middleName: '',
        lastName: 'Cruz',
        phone: '+63 917 555 0199',
        dateOfBirth: exact18Dob,
        address: '45 Tumaga Rd, Brgy. Tumaga',
        city: 'Zamboanga City',
      },
    })
    assert.equal(clearMiddle.status, 200)
    assert.equal(clearMiddle.data.user.middleName, null)
    assert.equal(clearMiddle.data.user.fullName, 'Liza Cruz')
  })

  it('registers a gardener without middle name, persists gardener onboarding fields, and supports admin edit', async () => {
    const dob = '1992-11-05'
    const res = await api('/auth/register', {
      method: 'POST',
      body: {
        firstName: 'Carlo',
        lastName: 'Mendoza',
        dateOfBirth: dob,
        phone: '09182223333',
        businessName: 'Zamboanga GreenScape',
        serviceArea: 'Tetuan & Pasonanca, Zamboanga City',
        yearsOfExperience: 7,
        description: 'Tropical lawn care and ornamental pruning.',
        email: `reg.gardener.${runId}@hugatiera.test`,
        password: 'Password123!',
        confirmPassword: 'Password123!',
        role: 'gardener',
      },
    })
    assert.equal(res.status, 201, `Unexpected response: ${JSON.stringify(res.data)}`)
    const gardenerId = res.data.user.id
    createdUserIds.push(gardenerId)
    assert.equal(res.data.user.middleName, null)
    assert.equal(res.data.user.dateOfBirth, dob)
    assert.equal(res.data.user.canActAsGardener, true)
    assert.equal(res.data.user.canActAsClient, true)
    assert.equal(res.data.user.isDualRole, true)

    const profileRes = await api('/profiles/me', { headers: { Cookie: res.cookie } })
    assert.equal(profileRes.status, 200)
    assert.equal(profileRes.data.profile.business_name, 'Zamboanga GreenScape')
    assert.equal(profileRes.data.profile.service_area, 'Tetuan & Pasonanca, Zamboanga City')
    assert.equal(profileRes.data.profile.years_of_experience, 7)
    assert.equal(Boolean(profileRes.data.profile.is_approved), false)

    // Create temporary admin to test admin edit of middleName & dateOfBirth
    const hash = await bcrypt.hash('Password123!', 10)
    const adminEmail = `reg.admin.${runId}@hugatiera.test`
    const [adminIns] = await pool.execute(
      'INSERT INTO users (email, password_hash, role, first_name, last_name) VALUES (?, ?, "administrator", "Admin", "Check")',
      [adminEmail, hash],
    )
    createdUserIds.push(adminIns.insertId)

    const adminLogin = await api('/auth/login', {
      method: 'POST',
      body: { email: adminEmail, password: 'Password123!' },
    })
    assert.equal(adminLogin.status, 200)

    const adminEdit = await api(`/admin/users/${gardenerId}`, {
      method: 'PATCH',
      headers: { Cookie: adminLogin.cookie },
      body: {
        firstName: 'Carlo',
        middleName: 'Santos',
        lastName: 'Mendoza',
        phone: '09182223333',
        dateOfBirth: '1991-10-15',
        role: 'gardener',
        isActive: true,
      },
    })
    assert.equal(adminEdit.status, 200)
    assert.equal(adminEdit.data.user.middle_name, 'Santos')
    assert.equal(adminEdit.data.user.date_of_birth, '1991-10-15')
    assert.ok(adminEdit.data.user.age >= 30)
  })
})
