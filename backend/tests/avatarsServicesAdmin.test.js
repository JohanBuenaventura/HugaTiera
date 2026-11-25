const path = require('node:path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-suite'
const { after, before, describe, it } = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const bcrypt = require('bcryptjs')
const app = require('../app')
const { pool } = require('../config/database')

const VALID_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

let server
let baseUrl
let adminCookie
let clientCookie
let clientId
let gardenerCookie
let gardenerId
let serviceId
let unusedUserId
let adminId
let inquiryId

async function api(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options)
  const text = await response.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  return { status: response.status, headers: response.headers, data }
}

function cookieFrom(res) {
  return res.headers.get('set-cookie').split(';')[0]
}

describe('Profile Avatars, Service Cover Photos & Admin Account Management', () => {
  before(async () => {
    const [[dbRow]] = await pool.query('SELECT DATABASE() AS db')
    assert.equal(dbRow.db, 'hugatiera_db_migration_test', 'Must run against hugatiera_db_migration_test')

    server = http.createServer(app)
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    baseUrl = `http://127.0.0.1:${server.address().port}/api`

    const stamp = Date.now()
    const hash = await bcrypt.hash('TestPass123!', 10)
    const [adminRes] = await pool.execute(
      'INSERT INTO users (email, password_hash, role, first_name, last_name) VALUES (?, ?, "administrator", "Admin", "Tester")',
      [`admin.asa.${stamp}@hugatiera.test`, hash],
    )
    adminId = adminRes.insertId

    const [clientRes] = await pool.execute(
      'INSERT INTO users (email, password_hash, role, first_name, last_name) VALUES (?, ?, "client", "Client", "Tester")',
      [`client.asa.${stamp}@hugatiera.test`, hash],
    )
    clientId = clientRes.insertId
    await pool.execute('INSERT INTO client_profiles (user_id, city) VALUES (?, "Zamboanga City")', [clientId])

    const [gardenerRes] = await pool.execute(
      'INSERT INTO users (email, password_hash, role, first_name, last_name) VALUES (?, ?, "gardener", "Gardener", "Tester")',
      [`gardener.asa.${stamp}@hugatiera.test`, hash],
    )
    gardenerId = gardenerRes.insertId
    await pool.execute('INSERT INTO gardener_profiles (user_id, business_name, is_approved) VALUES (?, "Green Thumb", TRUE)', [gardenerId])

    const [unusedRes] = await pool.execute(
      'INSERT INTO users (email, password_hash, role, first_name, last_name) VALUES (?, ?, "client", "Unused", "Account")',
      [`unused.asa.${stamp}@hugatiera.test`, hash],
    )
    unusedUserId = unusedRes.insertId
    await pool.execute('INSERT INTO client_profiles (user_id, city) VALUES (?, "Zamboanga City")', [unusedUserId])

    const [cats] = await pool.execute('SELECT id FROM service_categories WHERE is_active = TRUE LIMIT 1')
    const [svcRes] = await pool.execute(
      'INSERT INTO services (gardener_id, category_id, title, description) VALUES (?, ?, "Test Lawn Service", "Mowing and edging")',
      [gardenerId, cats[0].id],
    )
    serviceId = svcRes.insertId

    const loginAdmin = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `admin.asa.${stamp}@hugatiera.test`, password: 'TestPass123!' }),
    })
    adminCookie = cookieFrom(loginAdmin)

    const loginClient = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `client.asa.${stamp}@hugatiera.test`, password: 'TestPass123!' }),
    })
    clientCookie = cookieFrom(loginClient)

    const loginGardener = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `gardener.asa.${stamp}@hugatiera.test`, password: 'TestPass123!' }),
    })
    gardenerCookie = cookieFrom(loginGardener)
  })

  after(async () => {
    try {
      if (inquiryId) await pool.execute('DELETE FROM inquiries WHERE id = ?', [inquiryId])
      if (serviceId) await pool.execute('DELETE FROM services WHERE id = ?', [serviceId])
      const userIds = [adminId, clientId, gardenerId, unusedUserId].filter(Boolean)
      if (userIds.length > 0) {
        const placeholders = userIds.map(() => '?').join(', ')
        await pool.execute(`DELETE FROM users WHERE id IN (${placeholders})`, userIds)
      }
    } finally {
      if (server) await new Promise((resolve) => server.close(resolve))
      await pool.end()
    }
  })

  it('uploads, serves, validates, and removes a client profile picture (users.avatar_path)', async () => {
    const badForm = new FormData()
    badForm.append('avatar', new Blob([Buffer.from('not-an-image')], { type: 'image/png' }), 'fake.png')
    const badRes = await api('/profiles/me/avatar', { method: 'POST', headers: { Cookie: clientCookie }, body: badForm })
    assert.equal(badRes.status, 400)

    const form = new FormData()
    form.append('avatar', new Blob([VALID_PNG], { type: 'image/png' }), 'avatar.png')
    const uploadRes = await api('/profiles/me/avatar', { method: 'POST', headers: { Cookie: clientCookie }, body: form })
    assert.equal(uploadRes.status, 200)
    assert.ok(uploadRes.data.avatarPath)

    const getImg = await fetch(`${baseUrl}/profiles/${clientId}/avatar`)
    assert.equal(getImg.status, 200)
    assert.equal(getImg.headers.get('content-type'), 'image/png')

    const delRes = await api('/profiles/me/avatar', { method: 'DELETE', headers: { Cookie: clientCookie } })
    assert.equal(delRes.status, 200)

    const afterDel = await fetch(`${baseUrl}/profiles/${clientId}/avatar`)
    assert.equal(afterDel.status, 404)
  })

  it('uploads, serves, enforces role ownership, and removes a service cover photo (services.image_path)', async () => {
    const form = new FormData()
    form.append('image', new Blob([VALID_PNG], { type: 'image/png' }), 'cover.png')

    const forbidden = await api(`/services/${serviceId}/image`, { method: 'POST', headers: { Cookie: clientCookie }, body: form })
    assert.equal(forbidden.status, 403)

    const uploadRes = await api(`/services/${serviceId}/image`, { method: 'POST', headers: { Cookie: gardenerCookie }, body: form })
    assert.equal(uploadRes.status, 200)
    assert.ok(uploadRes.data.imagePath)

    const getImg = await fetch(`${baseUrl}/services/${serviceId}/image`)
    assert.equal(getImg.status, 200)
    assert.equal(getImg.headers.get('content-type'), 'image/png')

    const delRes = await api(`/services/${serviceId}/image`, { method: 'DELETE', headers: { Cookie: gardenerCookie } })
    assert.equal(delRes.status, 200)

    const afterDel = await fetch(`${baseUrl}/services/${serviceId}/image`)
    assert.equal(afterDel.status, 404)
  })

  it('supports admin account edit, role change, self-protection, and ON DELETE RESTRICT handling', async () => {
    const selfDemote = await api(`/admin/users/${adminId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ firstName: 'Admin', lastName: 'Tester', phone: '', role: 'client', isActive: true }),
    })
    assert.equal(selfDemote.status, 400)

    const selfDelete = await api(`/admin/users/${adminId}`, {
      method: 'DELETE',
      headers: { Cookie: adminCookie },
    })
    assert.equal(selfDelete.status, 400)

    const updateRes = await api(`/admin/users/${unusedUserId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ firstName: 'Updated', lastName: 'Person', phone: '09170001111', role: 'gardener', isActive: true }),
    })
    assert.equal(updateRes.status, 200)
    assert.equal(updateRes.data.user.role, 'gardener')
    assert.equal(updateRes.data.user.first_name, 'Updated')

    // Create an inquiry referencing clientId so ON DELETE RESTRICT triggers 409
    const [inquiryRes] = await pool.execute(
      'INSERT INTO inquiries (client_id, gardener_id, service_id, request_type, subject, description) VALUES (?, ?, ?, "direct", "Test", "Details")',
      [clientId, gardenerId, serviceId],
    )
    inquiryId = inquiryRes.insertId
    const restrictedDel = await api(`/admin/users/${clientId}`, {
      method: 'DELETE',
      headers: { Cookie: adminCookie },
    })
    assert.equal(restrictedDel.status, 409)

    const cleanDel = await api(`/admin/users/${unusedUserId}`, {
      method: 'DELETE',
      headers: { Cookie: adminCookie },
    })
    assert.equal(cleanDel.status, 204)
  })
})
