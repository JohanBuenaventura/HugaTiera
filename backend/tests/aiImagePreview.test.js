const fs = require('node:fs')
const path = require('node:path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true })

// Enforce that tests run EXCLUSIVELY against the separate test database
const ORIGINAL_DB = process.env.DB_NAME || 'hugatiera_db'
process.env.DB_NAME = 'hugatiera_db_migration_test'

const assert = require('node:assert/strict')
const http = require('node:http')
const { after, before, describe, test } = require('node:test')
const bcrypt = require('bcryptjs')
const sharp = require('sharp')

const app = require('../app')
const { pool } = require('../config/database')
const { resolveRequestImagePath } = require('../middleware/upload.middleware')
const {
  resetAiProvider,
  setAiProviderForTesting,
} = require('../services/ai.service')

let server
let baseUrl
const createdUserIds = []
const createdImageFiles = []

function extractCookie(response) {
  const raw = response.headers.get('set-cookie')
  if (!raw) return ''
  return raw.split(';')[0]
}

async function apiRequest(urlPath, { method = 'GET', body, cookie = '', headers = {} } = {}) {
  const requestHeaders = { ...headers }
  if (cookie) requestHeaders.Cookie = cookie

  let payload = body
  if (body && !(body instanceof FormData) && typeof body === 'object') {
    requestHeaders['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }

  const response = await fetch(`${baseUrl}${urlPath}`, {
    method,
    headers: requestHeaders,
    body: payload,
  })

  const data = response.status === 204 ? null : await response.json().catch(() => null)
  return {
    status: response.status,
    data,
    cookie: extractCookie(response) || cookie,
  }
}

async function makeTestJpeg(color = { r: 78, g: 132, b: 68 }) {
  return sharp({
    create: { width: 320, height: 240, channels: 3, background: color },
  }).jpeg({ quality: 82 }).toBuffer()
}

describe('Cloudflare AI Garden Photo Concept Editing (Migration 014 & POST /api/ai/garden-image)', () => {
  const runId = Date.now()
  let clientACookie = ''
  let clientBCookie = ''
  let gardenerCookie = ''
  let clientAId = null
  let clientBId = null
  let gardenerId = null

  const prevFlag = process.env.AI_IMAGE_GEN_ENABLED
  const prevLimit = process.env.AI_IMAGE_DAILY_LIMIT

  before(async () => {
    const [[dbRow]] = await pool.query('SELECT DATABASE() AS db')
    assert.equal(dbRow.db, 'hugatiera_db_migration_test', 'Must run against hugatiera_db_migration_test')
    assert.notEqual(dbRow.db, ORIGINAL_DB === 'hugatiera_db_migration_test' ? 'hugatiera_db' : ORIGINAL_DB)

    server = http.createServer(app)
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const { port } = server.address()
    baseUrl = `http://127.0.0.1:${port}/api`

    const hash = await bcrypt.hash('Password123!', 10)

    const [cA] = await pool.execute(
      `INSERT INTO users (first_name, last_name, email, password_hash, role, is_active)
       VALUES ('ClientA', 'ImgEdit', ?, ?, 'client', 1)`,
      [`imgedit.a.${runId}@hugatiera.test`, hash],
    )
    clientAId = cA.insertId
    createdUserIds.push(clientAId)
    await pool.execute('INSERT INTO client_profiles (user_id) VALUES (?)', [clientAId])

    const [cB] = await pool.execute(
      `INSERT INTO users (first_name, last_name, email, password_hash, role, is_active)
       VALUES ('ClientB', 'ImgEdit', ?, ?, 'client', 1)`,
      [`imgedit.b.${runId}@hugatiera.test`, hash],
    )
    clientBId = cB.insertId
    createdUserIds.push(clientBId)
    await pool.execute('INSERT INTO client_profiles (user_id) VALUES (?)', [clientBId])

    const [gRes] = await pool.execute(
      `INSERT INTO users (first_name, last_name, email, password_hash, role, is_active)
       VALUES ('Gardener', 'ImgEdit', ?, ?, 'gardener', 1)`,
      [`imgedit.g.${runId}@hugatiera.test`, hash],
    )
    gardenerId = gRes.insertId
    createdUserIds.push(gardenerId)
    await pool.execute(
      `INSERT INTO gardener_profiles (user_id, business_name, description, service_area, years_of_experience, is_approved)
       VALUES (?, 'Zamboanga Green Works', 'Landscaping', 'Tetuan, Zamboanga City', 5, 1)`,
      [gardenerId],
    )

    clientACookie = (await apiRequest('/auth/login', {
      method: 'POST',
      body: { email: `imgedit.a.${runId}@hugatiera.test`, password: 'Password123!' },
    })).cookie
    clientBCookie = (await apiRequest('/auth/login', {
      method: 'POST',
      body: { email: `imgedit.b.${runId}@hugatiera.test`, password: 'Password123!' },
    })).cookie
    gardenerCookie = (await apiRequest('/auth/login', {
      method: 'POST',
      body: { email: `imgedit.g.${runId}@hugatiera.test`, password: 'Password123!' },
    })).cookie
  })

  after(async () => {
    resetAiProvider()
    if (prevFlag === undefined) delete process.env.AI_IMAGE_GEN_ENABLED
    else process.env.AI_IMAGE_GEN_ENABLED = prevFlag
    if (prevLimit === undefined) delete process.env.AI_IMAGE_DAILY_LIMIT
    else process.env.AI_IMAGE_DAILY_LIMIT = prevLimit

    if (server) {
      await new Promise((resolve) => server.close(resolve))
    }

    for (const filePath of createdImageFiles) {
      try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
      } catch {
        // Ignore cleanup errors
      }
    }

    try {
      if (createdUserIds.length > 0) {
        await pool.query('DELETE FROM ai_usage_log WHERE user_id IN (?)', [createdUserIds])
        await pool.query('DELETE FROM request_images WHERE uploaded_by IN (?)', [createdUserIds])
        await pool.query('DELETE FROM users WHERE id IN (?)', [createdUserIds])
      }
    } finally {
      await pool.end()
    }
  })

  test('IMG-01: Feature flag disabled returns 501 IMAGE_GENERATION_POSTPONED', async () => {
    process.env.AI_IMAGE_GEN_ENABLED = 'false'
    const usage = await apiRequest('/ai/usage', { cookie: clientACookie })
    assert.equal(usage.status, 200)
    assert.equal(usage.data.imageGenerationEnabled, false)

    const res = await apiRequest('/ai/garden-image', {
      method: 'POST',
      cookie: clientACookie,
      body: { parentImageId: 999999, instructions: 'Remove dry grass and add plants' },
    })
    assert.equal(res.status, 501)
    assert.equal(res.data.code, 'IMAGE_GENERATION_POSTPONED')
  })

  test('IMG-02: Enabled photo edit enforces ownership, saves to generated/, links parent_image_id, and preserves text quota', async () => {
    process.env.AI_IMAGE_GEN_ENABLED = 'true'
    process.env.AI_IMAGE_DAILY_LIMIT = '3'

    const origBuf = await makeTestJpeg({ r: 95, g: 130, b: 60 })
    const editedBuf = await makeTestJpeg({ r: 40, g: 165, b: 75 })

    const uploadForm = new FormData()
    uploadForm.append('image', new Blob([origBuf], { type: 'image/jpeg' }), 'yard.jpg')
    const upRes = await apiRequest('/request-images', { method: 'POST', cookie: clientACookie, body: uploadForm })
    assert.equal(upRes.status, 201)
    const parentId = upRes.data.image.id

    const [[origDbRow]] = await pool.query('SELECT file_path FROM request_images WHERE id = ?', [parentId])
    createdImageFiles.push(resolveRequestImagePath(origDbRow.file_path))

    // Non-owner blocked with 403
    const forbiddenRes = await apiRequest('/ai/garden-image', {
      method: 'POST',
      cookie: clientBCookie,
      body: { parentImageId: parentId, instructions: 'Add tropical shrubs along the fence' },
    })
    assert.equal(forbiddenRes.status, 403)

    let providerCalls = 0
    setAiProviderForTesting({
      name: 'cloudflare-mock',
      getModel: () => 'gemini-3.5-flash-lite',
      async generateGardenImage({ instructions }) {
        if (/c\+\+/i.test(instructions)) {
          const err = new Error('AI visual previews can only edit gardening scenes.')
          err.statusCode = 400
          err.code = 'OFF_TOPIC_EDIT'
          throw err
        }
        providerCalls += 1
        return {
          imageBuffer: editedBuf,
          mimeType: 'image/jpeg',
          model: '@cf/black-forest-labs/flux-2-klein-4b',
          refinedPrompt: 'Cleaned tropical yard with bougainvillea along the fence',
        }
      },
    })

    try {
      // Off-topic edit returns 400 and does NOT consume daily quota
      const offRes = await apiRequest('/ai/garden-image', {
        method: 'POST',
        cookie: clientACookie,
        body: { parentImageId: parentId, instructions: 'create a c++ hello world program' },
      })
      assert.equal(offRes.status, 400)
      assert.equal(offRes.data.code, 'OFF_TOPIC_EDIT')
      assert.equal(providerCalls, 0)

      // Valid edit succeeds (201)
      const okRes = await apiRequest('/ai/garden-image', {
        method: 'POST',
        cookie: clientACookie,
        body: { parentImageId: parentId, instructions: 'Remove dry yellowish grass and pebbles, add bougainvillea' },
      })
      assert.equal(okRes.status, 201, `Expected 201, got ${JSON.stringify(okRes.data)}`)
      assert.equal(providerCalls, 1)
      assert.equal(okRes.data.originalImage.id, parentId)
      assert.equal(okRes.data.generatedImage.kind, 'ai_generated')
      assert.equal(okRes.data.generatedImage.parent_image_id, parentId)
      assert.equal(okRes.data.usage.used, 1)
      assert.equal(okRes.data.usage.remaining, 2)

      const [[genDbRow]] = await pool.query('SELECT file_path FROM request_images WHERE id = ?', [okRes.data.generatedImage.id])
      assert.ok(genDbRow.file_path.startsWith('generated/'), `Expected generated/ path, got ${genDbRow.file_path}`)
      createdImageFiles.push(resolveRequestImagePath(genDbRow.file_path))

      // Verify hourly text quota is untouched (still 0 used) while daily image quota shows 1 used
      const usageAfter = await apiRequest('/ai/usage', { cookie: clientACookie })
      assert.equal(usageAfter.status, 200)
      assert.equal(usageAfter.data.used, 0)
      assert.equal(usageAfter.data.imageGenerationEnabled, true)
      assert.equal(usageAfter.data.imageQuota.used, 1)
      assert.equal(usageAfter.data.imageQuota.remaining, 2)
    } finally {
      resetAiProvider()
    }
  })

  test('IMG-03: Direct multipart upload (/assistant tab) & concurrency-safe daily quota cap (3/day)', async () => {
    process.env.AI_IMAGE_GEN_ENABLED = 'true'
    process.env.AI_IMAGE_DAILY_LIMIT = '3'

    const inputBuf = await makeTestJpeg({ r: 100, g: 120, b: 55 })
    const outputBuf = await makeTestJpeg({ r: 35, g: 175, b: 85 })

    let providerCalls = 0
    setAiProviderForTesting({
      name: 'cloudflare-mock',
      getModel: () => 'gemini-3.5-flash-lite',
      async generateGardenImage() {
        providerCalls += 1
        await new Promise((r) => setTimeout(r, 25))
        return {
          imageBuffer: outputBuf,
          mimeType: 'image/jpeg',
          model: '@cf/black-forest-labs/flux-2-klein-4b',
          refinedPrompt: 'Trimmed lush lawn with tropical shrubs',
        }
      },
    })

    try {
      // Send 5 simultaneous requests as gardener (fresh 0/3 daily quota)
      const responses = await Promise.all(
        Array.from({ length: 5 }, (_, idx) => {
          const form = new FormData()
          form.append('image', new Blob([inputBuf], { type: 'image/jpeg' }), `yard-${idx}.jpg`)
          form.append('instructions', 'Clean the grass and add flowering tropical plants along the fence')
          return apiRequest('/ai/garden-image', {
            method: 'POST',
            cookie: gardenerCookie,
            body: form,
          })
        }),
      )

      const succeeded = responses.filter((r) => r.status === 201)
      const rateLimited = responses.filter((r) => r.status === 429)

      assert.equal(succeeded.length, 3, `Expected exactly 3 succeeded, got ${succeeded.length}`)
      assert.equal(rateLimited.length, 2, `Expected 2 rate-limited, got ${rateLimited.length}`)
      assert.equal(providerCalls, 3, 'Provider must never be called more than the daily cap')

      const [rows] = await pool.query('SELECT file_path FROM request_images WHERE uploaded_by = ?', [gardenerId])
      for (const r of rows) {
        createdImageFiles.push(resolveRequestImagePath(r.file_path))
      }
    } finally {
      resetAiProvider()
    }
  })
})
