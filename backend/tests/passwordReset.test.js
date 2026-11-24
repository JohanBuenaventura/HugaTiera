const path = require('node:path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true })

process.env.DB_NAME = process.env.TEST_DB_NAME || 'hugatiera_db_migration_test'

const assert = require('node:assert/strict')
const http = require('node:http')
const { after, before, test } = require('node:test')
const crypto = require('crypto')
const bcrypt = require('bcryptjs')
const app = require('../app')
const { pool } = require('../config/database')

let server
let baseUrl
let userId
const email = `password.reset.${Date.now()}@hugatiera.test`

async function apiRequest(requestPath, body, cookie = '') {
  const response = await fetch(`${baseUrl}${requestPath}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  })
  return {
    status: response.status,
    data: await response.json(),
    cookie: response.headers.get('set-cookie')?.split(';')[0] || cookie,
  }
}

before(async () => {
  const [[dbRow]] = await pool.query('SELECT DATABASE() AS db')
  assert.equal(dbRow.db, 'hugatiera_db_migration_test')

  const passwordHash = await bcrypt.hash('OldPassword123!', 12)
  const [result] = await pool.execute(
    'INSERT INTO users (email, password_hash, role, first_name, last_name, is_active) VALUES (?, ?, ?, ?, ?, TRUE)',
    [email, passwordHash, 'client', 'Reset', 'Tester'],
  )
  userId = result.insertId
  await pool.execute('INSERT INTO client_profiles (user_id, address) VALUES (?, ?)', [userId, 'Zamboanga City'])

  server = http.createServer(app)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  baseUrl = `http://127.0.0.1:${server.address().port}/api`
})

after(async () => {
  await pool.execute('DELETE FROM users WHERE id = ?', [userId])
  if (server) await new Promise((resolve) => server.close(resolve))
  await pool.end()
})

test('forgot password does not reveal whether the account exists', async () => {
  const known = await apiRequest('/auth/forgot-password', { email })
  const unknown = await apiRequest('/auth/forgot-password', { email: `missing.${Date.now()}@hugatiera.test` })

  assert.equal(known.status, 200)
  assert.equal(unknown.status, 200)
  assert.equal(known.data.message, unknown.data.message)
})

test('reset token changes the password once and rejects reuse', async () => {
  const token = crypto.randomBytes(32).toString('hex')
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
  await pool.execute(
    'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 30 MINUTE))',
    [userId, tokenHash],
  )

  const reset = await apiRequest('/auth/reset-password', { token, password: 'NewPassword123!' })
  assert.equal(reset.status, 200, JSON.stringify(reset.data))

  const reuse = await apiRequest('/auth/reset-password', { token, password: 'AnotherPassword123!' })
  assert.equal(reuse.status, 400)

  const login = await apiRequest('/auth/login', { email, password: 'NewPassword123!' })
  assert.equal(login.status, 200)
})

test('signed-in users can change their password after verifying the current password', async () => {
  const login = await apiRequest('/auth/login', { email, password: 'NewPassword123!' })
  assert.equal(login.status, 200)

  const wrongPassword = await apiRequest('/auth/change-password', {
    currentPassword: 'WrongPassword123!',
    newPassword: 'ChangedPassword123!',
  }, login.cookie)
  assert.equal(wrongPassword.status, 401)

  const resetToken = crypto.randomBytes(32).toString('hex')
  await pool.execute(
    'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 30 MINUTE))',
    [userId, crypto.createHash('sha256').update(resetToken).digest('hex')],
  )

  const changed = await apiRequest('/auth/change-password', {
    currentPassword: 'NewPassword123!',
    newPassword: 'ChangedPassword123!',
  }, login.cookie)
  assert.equal(changed.status, 200)

  const oldLogin = await apiRequest('/auth/login', { email, password: 'NewPassword123!' })
  const newLogin = await apiRequest('/auth/login', { email, password: 'ChangedPassword123!' })
  assert.equal(oldLogin.status, 401)
  assert.equal(newLogin.status, 200)

  const [[tokenRow]] = await pool.execute(
    'SELECT used_at FROM password_reset_tokens WHERE user_id = ? AND token_hash = ?',
    [userId, crypto.createHash('sha256').update(resetToken).digest('hex')],
  )
  assert.ok(tokenRow.used_at)
})
