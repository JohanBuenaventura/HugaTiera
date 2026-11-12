const fs = require('node:fs')
const path = require('node:path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true })

// Enforce that R6 tests run EXCLUSIVELY against the separate test database
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
  DEFAULT_MODEL,
  MAX_OUTPUT_TOKENS,
  buildGenerationConfig,
  extractCandidateText,
  generateGardenImage,
  getAiProvider,
  normalizeModelName,
  parseRequirementsJson,
  resetAiProvider,
  setAiProviderForTesting,
} = require('../services/ai.service')

let server
let baseUrl
const createdUserIds = []
const createdInquiryIds = []
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
    headers: response.headers,
  }
}

async function uploadDraftPhoto(cookie, color = { r: 70, g: 145, b: 85 }) {
  const buf = await sharp({
    create: {
      width: 360,
      height: 240,
      channels: 3,
      background: color,
    },
  })
    .jpeg({ quality: 82 })
    .toBuffer()

  const form = new FormData()
  form.append('image', new Blob([buf], { type: 'image/jpeg' }), 'r6-garden-photo.jpg')

  const res = await apiRequest('/request-images', {
    method: 'POST',
    cookie,
    body: form,
  })
  assert.equal(res.status, 201, `Draft image upload failed: ${JSON.stringify(res.data)}`)

  const [[imgRow]] = await pool.query('SELECT file_path FROM request_images WHERE id = ?', [res.data.image.id])
  if (imgRow?.file_path) {
    createdImageFiles.push(resolveRequestImagePath(imgRow.file_path))
  }
  return res.data.image
}

describe('Step R6 – Gemini Requirements Assistant, Photo Understanding, Provider Decision-Support & DB Usage Limits', () => {
  const runId = Date.now()
  let clientACookie = ''
  let clientBCookie = ''
  let gardenerCookie = ''

  let clientAId = null
  let clientBId = null
  let gardenerId = null
  let categoryId = null
  let categoryName = null

  before(async () => {
    const [[dbRow]] = await pool.query('SELECT DATABASE() AS db')
    assert.equal(dbRow.db, 'hugatiera_db_migration_test', 'Must run against hugatiera_db_migration_test')
    assert.notEqual(dbRow.db, ORIGINAL_DB === 'hugatiera_db_migration_test' ? 'hugatiera_db' : ORIGINAL_DB)

    server = http.createServer(app)
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const { port } = server.address()
    baseUrl = `http://127.0.0.1:${port}/api`

    const password = 'Password123!'
    const hash = await bcrypt.hash(password, 10)

    const [cARes] = await pool.execute(
      `INSERT INTO users (first_name, last_name, email, password_hash, role, is_active)
       VALUES ('ClientA', 'R6', ?, ?, 'client', 1)`,
      [`r6.clienta.${runId}@hugatiera.test`, hash],
    )
    clientAId = cARes.insertId
    createdUserIds.push(clientAId)
    await pool.execute('INSERT INTO client_profiles (user_id) VALUES (?)', [clientAId])

    const [cBRes] = await pool.execute(
      `INSERT INTO users (first_name, last_name, email, password_hash, role, is_active)
       VALUES ('ClientB', 'R6', ?, ?, 'client', 1)`,
      [`r6.clientb.${runId}@hugatiera.test`, hash],
    )
    clientBId = cBRes.insertId
    createdUserIds.push(clientBId)
    await pool.execute('INSERT INTO client_profiles (user_id) VALUES (?)', [clientBId])

    const [gRes] = await pool.execute(
      `INSERT INTO users (first_name, last_name, email, password_hash, role, is_active)
       VALUES ('GardenerOne', 'R6', ?, ?, 'gardener', 1)`,
      [`r6.gardener.${runId}@hugatiera.test`, hash],
    )
    gardenerId = gRes.insertId
    createdUserIds.push(gardenerId)
    await pool.execute(
      `INSERT INTO gardener_profiles (user_id, business_name, description, service_area, years_of_experience, is_approved)
       VALUES (?, 'Zamboanga Landscape Studio', 'Tropical garden design', 'Tetuan, Zamboanga City', 6, 1)`,
      [gardenerId],
    )

    const [cats] = await pool.query('SELECT id, name FROM service_categories WHERE is_active = 1 ORDER BY id ASC LIMIT 1')
    if (cats[0]) {
      categoryId = cats[0].id
      categoryName = cats[0].name
    } else {
      const [cIns] = await pool.execute(
        "INSERT INTO service_categories (name, description, is_active) VALUES (?, 'Landscaping and garden design', 1)",
        [`Landscaping R6 ${runId}`],
      )
      categoryId = cIns.insertId
      categoryName = `Landscaping R6 ${runId}`
    }

    const login = async (email) => {
      const res = await apiRequest('/auth/login', {
        method: 'POST',
        body: { email, password },
      })
      assert.equal(res.status, 200)
      return res.cookie
    }

    clientACookie = await login(`r6.clienta.${runId}@hugatiera.test`)
    clientBCookie = await login(`r6.clientb.${runId}@hugatiera.test`)
    gardenerCookie = await login(`r6.gardener.${runId}@hugatiera.test`)
  })

  after(async () => {
    resetAiProvider()
    try {
      if (server) {
        await new Promise((resolve) => server.close(resolve))
      }

      for (const filePath of createdImageFiles) {
        try {
          if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath)
        } catch {
          // ignore cleanup error
        }
      }

      if (createdInquiryIds.length > 0) {
        await pool.query('DELETE FROM request_events WHERE inquiry_id IN (?)', [createdInquiryIds])
        await pool.query('DELETE FROM request_images WHERE inquiry_id IN (?)', [createdInquiryIds])
        await pool.query('DELETE FROM quotations WHERE inquiry_id IN (?)', [createdInquiryIds])
        await pool.query('DELETE FROM inquiries WHERE id IN (?)', [createdInquiryIds])
      }
      if (createdUserIds.length > 0) {
        await pool.query('DELETE FROM ai_usage_log WHERE user_id IN (?)', [createdUserIds])
        await pool.query('DELETE FROM request_images WHERE uploaded_by IN (?)', [createdUserIds])
        await pool.query('DELETE FROM notifications WHERE user_id IN (?)', [createdUserIds])
        await pool.query('DELETE FROM users WHERE id IN (?)', [createdUserIds])
      }
    } finally {
      await pool.end()
    }
  })

  test('R6-01: Provider abstraction, Gemini 3.x model preservation & generationConfig, and postponed image-generation guard (501 IMAGE_GENERATION_POSTPONED)', async () => {
    assert.equal(normalizeModelName(''), DEFAULT_MODEL)
    assert.equal(normalizeModelName('gemini-3.8-flash'), 'gemini-3.8-flash')
    assert.equal(normalizeModelName('gemini-3.5-flash-lite'), 'gemini-3.5-flash-lite')
    assert.equal(normalizeModelName('gemini-2.5-flash-lite'), 'gemini-2.5-flash-lite')
    assert.equal(normalizeModelName('gemini-2.5-flash'), 'gemini-2.5-flash')
    assert.equal(normalizeModelName('gemini-pro'), DEFAULT_MODEL)
    assert.equal(normalizeModelName('gemini-1.5-flash'), DEFAULT_MODEL)

    const g38Config = buildGenerationConfig({
      model: 'gemini-3.8-flash',
      temperature: 0.3,
      responseMimeType: 'application/json',
    })
    assert.equal(g38Config.maxOutputTokens, MAX_OUTPUT_TOKENS)
    assert.equal(g38Config.responseMimeType, 'application/json')
    assert.deepEqual(g38Config.thinkingConfig, { thinkingLevel: 'low' })

    const g25Config = buildGenerationConfig({
      model: 'gemini-2.5-flash-lite',
      temperature: 0.4,
    })
    assert.equal(g25Config.thinkingConfig, undefined)

    const extracted = extractCandidateText({
      candidates: [
        {
          content: {
            parts: [
              { thought: true, text: 'Internal chain of thought reasoning...' },
              { text: '{"structuredSummary":"Clean output"}' },
            ],
          },
        },
      ],
    })
    assert.equal(extracted, '{"structuredSummary":"Clean output"}')

    const defaultProvider = getAiProvider()
    assert.equal(defaultProvider.name, 'gemini')

    await assert.rejects(
      async () => generateGardenImage({ prompt: 'Generate a 3D garden render' }),
      (err) => err.statusCode === 501 && err.code === 'IMAGE_GENERATION_POSTPONED',
    )

    const usageRes = await apiRequest('/ai/usage', { cookie: clientACookie })
    assert.equal(usageRes.status, 200)
    assert.equal(usageRes.data.limit, 10)
    assert.equal(usageRes.data.used, 0)
    assert.equal(usageRes.data.remaining, 10)
    assert.equal(usageRes.data.imageGenerationEnabled, false)
  })

  test('R6-02: Uploaded-photo understanding (POST /api/ai/photo-analysis) & client editorial control over photo description (PATCH /api/request-images/:id)', async () => {
    const draftImg = await uploadDraftPhoto(clientACookie)

    let receivedMimeType = null
    let receivedBufferLength = 0
    let receivedNotes = ''

    setAiProviderForTesting({
      name: 'gemini-mock',
      getModel: () => 'gemini-2.5-flash-lite',
      async analyzeGardenPhoto({ imageBuffer, mimeType, clientNotes }) {
        receivedMimeType = mimeType
        receivedBufferLength = imageBuffer.length
        receivedNotes = clientNotes
        return 'Partially shaded 20 sqm backyard lawn with overgrown carabao grass and a bare concrete fence border suitable for ornamental shrubs.'
      },
    })

    try {
      // 1. Non-owner Client B cannot analyze Client A's uploaded photo (403)
      const forbiddenRes = await apiRequest('/ai/photo-analysis', {
        method: 'POST',
        cookie: clientBCookie,
        body: { imageId: draftImg.id, notes: 'Trying to analyze someone else photo' },
      })
      assert.equal(forbiddenRes.status, 403)

      // 2. Client A analyzes their uploaded garden photo
      const analyzeRes = await apiRequest('/ai/photo-analysis', {
        method: 'POST',
        cookie: clientACookie,
        body: {
          imageId: draftImg.id,
          notes: 'Backyard facing east in Tetuan',
        },
      })
      assert.equal(analyzeRes.status, 200, `Expected 200, got: ${JSON.stringify(analyzeRes.data)}`)
      assert.equal(receivedMimeType, 'image/jpeg')
      assert.ok(receivedBufferLength > 100, 'Provider must receive the sharp-sanitized image buffer')
      assert.equal(receivedNotes, 'Backyard facing east in Tetuan')
      assert.match(analyzeRes.data.aiDescription, /overgrown carabao grass/i)
      assert.equal(analyzeRes.data.image.ai_description, analyzeRes.data.aiDescription)

      // 3. Verify ai_usage_log recorded the photo_analysis event
      const [logs] = await pool.query(
        "SELECT * FROM ai_usage_log WHERE user_id = ? AND feature = 'photo_analysis' ORDER BY id DESC LIMIT 1",
        [clientAId],
      )
      assert.equal(logs.length, 1)
      assert.equal(logs[0].outcome, 'success')
      assert.equal(logs[0].request_image_id, draftImg.id)

      // 4. Client A edits/refines the photo description via PATCH /api/request-images/:id
      const editedText = 'Client-reviewed space note: 20 sqm east-facing lawn needing grass trimming and 8m fence-line shrub border.'
      const patchRes = await apiRequest(`/request-images/${draftImg.id}`, {
        method: 'PATCH',
        cookie: clientACookie,
        body: { aiDescription: editedText },
      })
      assert.equal(patchRes.status, 200)
      assert.equal(patchRes.data.image.ai_description, editedText)

      // Non-owner Client B cannot edit Client A's photo description (403)
      const badPatch = await apiRequest(`/request-images/${draftImg.id}`, {
        method: 'PATCH',
        cookie: clientBCookie,
        body: { aiDescription: 'Unauthorized edit' },
      })
      assert.equal(badPatch.status, 403)
    } finally {
      resetAiProvider()
    }
  })

  test('R6-03: Requirements organization, category suggestion & gardening ideas (POST /api/ai/requirements)', async () => {
    const draftImg = await uploadDraftPhoto(clientACookie, { r: 60, g: 120, b: 70 })
    await apiRequest(`/request-images/${draftImg.id}`, {
      method: 'PATCH',
      cookie: clientACookie,
      body: { aiDescription: 'Sunny front yard slope with compacted soil.' },
    })

    let capturedPayload = null
    setAiProviderForTesting({
      name: 'gemini-mock',
      getModel: () => 'gemini-2.5-flash-lite',
      async generateRequirementAssistance(payload) {
        capturedPayload = payload
        return parseRequirementsJson(
          JSON.stringify({
            structuredSummary: 'Client requests front yard slope stabilization, soil conditioning, and drought-tolerant ornamental planting in Tetuan.',
            refinedDescription: 'Prepare 15 sqm sunny front yard slope with organic compost, install stone edging, and plant drought-tolerant tropical shrubs.',
            suggestedCategoryId: categoryId,
            suggestedCategoryName: categoryName,
            gardeningIdeas: [
              'Use dwarf pandakaki and bougainvillea for full-sun slope resilience in Zamboanga City.',
              'Add coco coir and organic mulch to reduce wet-season soil erosion.',
            ],
            followUpQuestions: [
              'Is there an outdoor water tap near the front yard?',
              'Do you prefer flowering shrubs or foliage-focused plants?',
            ],
          }),
          payload.categories,
        )
      },
    })

    try {
      // Validation check: empty description returns 400
      const emptyReq = await apiRequest('/ai/requirements', {
        method: 'POST',
        cookie: clientACookie,
        body: { subject: 'Front yard', description: '   ' },
      })
      assert.equal(emptyReq.status, 400)

      // Authorization check: Client B cannot reference Client A's uploaded photo ID (403)
      const forbiddenImgReq = await apiRequest('/ai/requirements', {
        method: 'POST',
        cookie: clientBCookie,
        body: {
          subject: 'Test',
          description: 'Need lawn mowing',
          imageIds: [draftImg.id],
        },
      })
      assert.equal(forbiddenImgReq.status, 403)

      // Valid requirement assistance request by Client A
      const reqRes = await apiRequest('/ai/requirements', {
        method: 'POST',
        cookie: clientACookie,
        body: {
          subject: 'Front yard slope planting',
          description: 'My front yard slope has hard soil and weeds. Want low maintenance plants.',
          location: 'Tetuan, Zamboanga City',
          imageIds: [draftImg.id],
        },
      })
      assert.equal(reqRes.status, 200)
      assert.ok(capturedPayload)
      assert.deepEqual(capturedPayload.photoDescriptions, ['Sunny front yard slope with compacted soil.'])
      assert.ok(capturedPayload.categories.some((c) => c.id === categoryId))

      const { suggestion } = reqRes.data
      assert.match(suggestion.structuredSummary, /slope stabilization/i)
      assert.equal(suggestion.suggestedCategoryId, categoryId)
      assert.equal(suggestion.suggestedCategoryName, categoryName)
      assert.equal(suggestion.gardeningIdeas.length, 2)
      assert.equal(suggestion.followUpQuestions.length, 2)

      // Verify ai_usage_log recorded the requirements event
      const [logs] = await pool.query(
        "SELECT * FROM ai_usage_log WHERE user_id = ? AND feature = 'requirements' ORDER BY id DESC LIMIT 1",
        [clientAId],
      )
      assert.equal(logs.length, 1)
      assert.equal(logs[0].outcome, 'success')
    } finally {
      resetAiProvider()
    }
  })

  test('R6-04: Provider Decision-Support View presents photo, photo ai_description, client requirements, and client-approved AI summary together', async () => {
    const draftImg = await uploadDraftPhoto(clientACookie, { r: 80, g: 160, b: 90 })
    const reviewedPhotoNote = 'Overgrown 30 sqm backyard with perimeter wall and partial afternoon shade.'
    const reviewedAiSummary = 'Client-approved summary: Clear 30 sqm overgrown lawn, level topsoil, and plant low-maintenance tropical border shrubs.'

    await apiRequest(`/request-images/${draftImg.id}`, {
      method: 'PATCH',
      cookie: clientACookie,
      body: { aiDescription: reviewedPhotoNote },
    })

    const createRes = await apiRequest('/inquiries', {
      method: 'POST',
      cookie: clientACookie,
      body: {
        requestType: 'general',
        categoryId,
        subject: 'Backyard clearing and tropical border planting',
        description: 'Need full clearing of overgrown grass and planting along the perimeter wall.',
        aiSummary: reviewedAiSummary,
        location: 'Tetuan, Zamboanga City',
        expiresInDays: 14,
        imageIds: [draftImg.id],
      },
    })
    assert.equal(createRes.status, 201)
    const inquiryId = createRes.data.id
    createdInquiryIds.push(inquiryId)

    // 1. Approved gardener sees the request, AI summary, and photo + ai_description on GET /api/inquiries/open
    const boardRes = await apiRequest('/inquiries/open', { cookie: gardenerCookie })
    assert.equal(boardRes.status, 200)
    const boardItem = boardRes.data.requests.find((r) => r.id === inquiryId)
    assert.ok(boardItem)
    assert.equal(boardItem.ai_summary, reviewedAiSummary)
    assert.equal(boardItem.images.length, 1)
    assert.equal(boardItem.images[0].ai_description, reviewedPhotoNote)

    // 2. Approved gardener opening GET /api/inquiries/:id receives the complete decision-support view
    const detailRes = await apiRequest(`/inquiries/${inquiryId}`, { cookie: gardenerCookie })
    assert.equal(detailRes.status, 200)
    assert.equal(detailRes.data.inquiry.description, 'Need full clearing of overgrown grass and planting along the perimeter wall.')
    assert.equal(detailRes.data.inquiry.ai_summary, reviewedAiSummary)
    assert.equal(detailRes.data.images.length, 1)
    assert.equal(detailRes.data.images[0].id, draftImg.id)
    assert.equal(detailRes.data.images[0].ai_description, reviewedPhotoNote)
  })

  test('R6-05: Database-backed per-user rate limit in ai_usage_log enforces 10 requests/hour and logs rate_limited outcome', async () => {
    // Clear Client A's usage log first so we test the exact 10-request window deterministically
    await pool.execute('DELETE FROM ai_usage_log WHERE user_id = ?', [clientAId])

    // Seed 9 recent successful usage rows in ai_usage_log for Client A
    for (let i = 0; i < 9; i += 1) {
      await pool.execute(
        `INSERT INTO ai_usage_log (user_id, feature, model, outcome)
         VALUES (?, 'garden_plan', 'gemini-2.5-flash-lite', 'success')`,
        [clientAId],
      )
    }

    setAiProviderForTesting({
      name: 'gemini-mock',
      getModel: () => 'gemini-2.5-flash-lite',
      async generateGardenPlan() {
        return 'Mock garden plan #10.'
      },
    })

    try {
      // 10th request in the hour succeeds
      const tenthRes = await apiRequest('/ai/garden-plan', {
        method: 'POST',
        cookie: clientACookie,
        body: { input: '10th request within the hourly window' },
      })
      assert.equal(tenthRes.status, 200)

      // 11th request in the hour is blocked with 429 and logged as outcome = 'rate_limited'
      const eleventhRes = await apiRequest('/ai/garden-plan', {
        method: 'POST',
        cookie: clientACookie,
        body: { input: '11th request should be rate limited' },
      })
      assert.equal(eleventhRes.status, 429)
      assert.match(eleventhRes.data.message, /limited to 10 requests per hour/i)

      const [rateLimitedRows] = await pool.query(
        "SELECT * FROM ai_usage_log WHERE user_id = ? AND outcome = 'rate_limited' ORDER BY id DESC LIMIT 1",
        [clientAId],
      )
      assert.equal(rateLimitedRows.length, 1)
      assert.equal(rateLimitedRows[0].error_code, 'RATE_LIMIT_EXCEEDED')

      // Client B has a separate per-user quota and can still use the AI assistant
      const clientBRes = await apiRequest('/ai/garden-plan', {
        method: 'POST',
        cookie: clientBCookie,
        body: { input: 'Client B request works independently' },
      })
      assert.equal(clientBRes.status, 200)
    } finally {
      resetAiProvider()
      await pool.execute('DELETE FROM ai_usage_log WHERE user_id IN (?, ?)', [clientAId, clientBId])
    }
  })

  test('R6-06: Graceful AI failure handling logs error codes in ai_usage_log and never blocks the inquiry submission workflow', async () => {
    const originalFallbackEnv = process.env.GEMINI_FALLBACK_MODEL
    delete process.env.GEMINI_FALLBACK_MODEL

    try {
      // 1. Simulate provider 429 quota exhaustion (single-model path; fallback path is tested in R6-08)
      setAiProviderForTesting({
        name: 'gemini-mock',
        getModel: () => 'gemini-2.5-flash-lite',
        async generateRequirementAssistance() {
          const err = new Error('Quota exceeded')
          err.providerStatus = 429
          throw err
        },
      })

      const quotaRes = await apiRequest('/ai/requirements', {
        method: 'POST',
        cookie: clientACookie,
        body: {
          subject: 'Lawn care',
          description: 'Need bi-weekly lawn mowing and edging.',
        },
      })
      assert.equal(quotaRes.status, 503)
      assert.match(quotaRes.data.message, /rate limit or quota was reached/i)

      const [errLogs] = await pool.query(
        "SELECT * FROM ai_usage_log WHERE user_id = ? AND outcome = 'error' ORDER BY id DESC LIMIT 1",
        [clientAId],
      )
      assert.equal(errLogs.length, 1)
      assert.equal(errLogs[0].error_code, 'PROVIDER_429')

      // 2. Simulate provider timeout (AbortError -> 504)
      setAiProviderForTesting({
        name: 'gemini-mock',
        getModel: () => 'gemini-2.5-flash-lite',
        async generateGardenPlan() {
          const err = new Error('The operation was aborted')
          err.name = 'AbortError'
          throw err
        },
      })

      const timeoutRes = await apiRequest('/ai/garden-plan', {
        method: 'POST',
        cookie: clientACookie,
        body: { input: 'Test timeout handling' },
      })
      assert.equal(timeoutRes.status, 504)
    } finally {
      if (originalFallbackEnv === undefined) {
        delete process.env.GEMINI_FALLBACK_MODEL
      } else {
        process.env.GEMINI_FALLBACK_MODEL = originalFallbackEnv
      }
      resetAiProvider()
    }

    // 3. Even when AI fails or is unconfigured, the client can still upload a photo and submit a request normally
    const fallbackImg = await uploadDraftPhoto(clientACookie)
    const fallbackInq = await apiRequest('/inquiries', {
      method: 'POST',
      cookie: clientACookie,
      body: {
        requestType: 'direct',
        gardenerId,
        subject: 'Manual inquiry when AI is unavailable',
        description: 'Client wrote requirements manually without AI.',
        location: 'Tetuan, Zamboanga City',
        imageIds: [fallbackImg.id],
      },
    })
    assert.equal(fallbackInq.status, 201)
    createdInquiryIds.push(fallbackInq.data.id)
    assert.equal(fallbackInq.data.inquiry.ai_summary, null)
    assert.equal(fallbackInq.data.images.length, 1)
  })

  test('R6-07: True Concurrency Verification (Promise.all) — 15 simultaneous requests result in at most 10 provider calls for one user', async () => {
    await pool.execute('DELETE FROM ai_usage_log WHERE user_id = ?', [clientAId])

    let providerCallCount = 0
    setAiProviderForTesting({
      name: 'gemini-mock',
      getModel: () => 'gemini-3.8-flash',
      async generateGardenPlan(input) {
        providerCallCount += 1
        // Simulate external Gemini network latency while all 15 requests are in flight
        await new Promise((resolve) => setTimeout(resolve, 40))
        return `Concurrent response for: ${input}`
      },
    })

    try {
      const requests = Array.from({ length: 15 }, (_, idx) => (
        apiRequest('/ai/garden-plan', {
          method: 'POST',
          cookie: clientACookie,
          body: { input: `Concurrent garden plan request #${idx + 1}` },
        })
      ))

      const responses = await Promise.all(requests)
      const status200Count = responses.filter((r) => r.status === 200).length
      const status429Count = responses.filter((r) => r.status === 429).length

      assert.equal(providerCallCount, 10, `Expected at most 10 provider calls, got ${providerCallCount}`)
      assert.equal(status200Count, 10, `Expected exactly 10 successful responses, got ${status200Count}`)
      assert.equal(status429Count, 5, `Expected exactly 5 rate-limited (429) responses, got ${status429Count}`)

      const [logRows] = await pool.query(
        'SELECT outcome, error_code FROM ai_usage_log WHERE user_id = ?',
        [clientAId],
      )
      const successLogs = logRows.filter((r) => r.outcome === 'success' && r.error_code === null)
      const rateLimitedLogs = logRows.filter((r) => r.outcome === 'rate_limited' && r.error_code === 'RATE_LIMIT_EXCEEDED')

      assert.equal(successLogs.length, 10)
      assert.equal(rateLimitedLogs.length, 5)
    } finally {
      resetAiProvider()
      await pool.execute('DELETE FROM ai_usage_log WHERE user_id = ?', [clientAId])
    }
  })

  test('R6-08: Automatic Gemini Model Fallback (Scenarios A–G across all 3 AI features & single-slot quota accounting)', async () => {
    const originalFallbackEnv = process.env.GEMINI_FALLBACK_MODEL
    process.env.GEMINI_FALLBACK_MODEL = 'gemini-3.5-flash-lite'
    await pool.execute('DELETE FROM ai_usage_log WHERE user_id = ?', [clientAId])

    try {
      // Verify GET /ai/usage reports primaryModel and fallbackModel when configured
      const usageCheck0 = await apiRequest('/ai/usage', { cookie: clientACookie })
      assert.equal(usageCheck0.status, 200)
      assert.equal(usageCheck0.data.primaryModel, 'gemini-3.8-flash')
      assert.equal(usageCheck0.data.fallbackModel, 'gemini-3.5-flash-lite')
      assert.equal(usageCheck0.data.fallbackEnabled, true)
      assert.equal(usageCheck0.data.used, 0)

      // Scenario A: Primary model succeeds -> only gemini-3.8-flash called, fallback not invoked, 1 quota slot consumed
      const callsA = []
      setAiProviderForTesting({
        name: 'gemini-mock',
        getModel: () => 'gemini-3.8-flash',
        async generateGardenPlan(input, opts = {}) {
          callsA.push(opts)
          return `Primary garden plan for ${input}`
        },
      })
      const resA = await apiRequest('/ai/garden-plan', {
        method: 'POST',
        cookie: clientACookie,
        body: { input: 'Scenario A primary success' },
      })
      assert.equal(resA.status, 200)
      assert.equal(resA.data.model, 'gemini-3.8-flash')
      assert.equal(resA.data.fallbackUsed, false)
      assert.equal(callsA.length, 1)
      assert.equal(callsA[0].model, 'gemini-3.8-flash')
      assert.equal(callsA[0].isFallback, false)

      const [[logA]] = await pool.query(
        'SELECT model, outcome, error_code FROM ai_usage_log WHERE user_id = ? ORDER BY id DESC LIMIT 1',
        [clientAId],
      )
      assert.equal(logA.model, 'gemini-3.8-flash')
      assert.equal(logA.outcome, 'success')
      assert.equal(logA.error_code, null)

      // Scenario B: Primary returns HTTP 503 on generateRequirementAssistance -> gemini-3.5-flash-lite invoked once, 1 slot consumed
      const callsB = []
      setAiProviderForTesting({
        name: 'gemini-mock',
        getModel: () => 'gemini-3.8-flash',
        async generateRequirementAssistance(payload, opts = {}) {
          callsB.push(opts)
          if (!opts.isFallback) {
            const err = new Error('Primary model overloaded')
            err.providerStatus = 503
            throw err
          }
          return parseRequirementsJson(
            JSON.stringify({
              structuredSummary: 'Fallback requirement summary from Gemini 3.5 Flash-Lite.',
              refinedDescription: 'Refined by fallback model.',
              suggestedCategoryId: categoryId,
              suggestedCategoryName: categoryName,
              gardeningIdeas: ['Use tropical mulch'],
              followUpQuestions: ['Any water source nearby?'],
            }),
            payload.categories,
          )
        },
      })
      const resB = await apiRequest('/ai/requirements', {
        method: 'POST',
        cookie: clientACookie,
        body: {
          subject: 'Scenario B fallback on 503',
          description: 'Need lawn trimming and shrub border.',
        },
      })
      assert.equal(resB.status, 200)
      assert.equal(resB.data.model, 'gemini-3.5-flash-lite')
      assert.equal(resB.data.fallbackUsed, true)
      assert.match(resB.data.suggestion.structuredSummary, /Fallback requirement summary/i)
      assert.equal(callsB.length, 2)
      assert.equal(callsB[0].model, 'gemini-3.8-flash')
      assert.equal(callsB[1].model, 'gemini-3.5-flash-lite')
      assert.equal(callsB[1].isFallback, true)

      const [[logB]] = await pool.query(
        'SELECT model, outcome, error_code FROM ai_usage_log WHERE user_id = ? ORDER BY id DESC LIMIT 1',
        [clientAId],
      )
      assert.equal(logB.model, 'gemini-3.5-flash-lite')
      assert.equal(logB.outcome, 'success')
      assert.equal(logB.error_code, 'FALLBACK_FROM_PROVIDER_503')

      // Scenario C: Primary returns HTTP 429 on analyzeGardenPhoto -> fallback succeeds, 1 slot consumed
      const draftImgC = await uploadDraftPhoto(clientACookie, { r: 75, g: 150, b: 80 })
      const callsC = []
      setAiProviderForTesting({
        name: 'gemini-mock',
        getModel: () => 'gemini-3.8-flash',
        async analyzeGardenPhoto(_payload, opts = {}) {
          callsC.push(opts)
          if (!opts.isFallback) {
            const err = new Error('Primary rate limit reached')
            err.providerStatus = 429
            throw err
          }
          return 'Fallback photo analysis: 20 sqm sunny lawn with perimeter wall.'
        },
      })
      const resC = await apiRequest('/ai/photo-analysis', {
        method: 'POST',
        cookie: clientACookie,
        body: { imageId: draftImgC.id, notes: 'Scenario C 429 fallback' },
      })
      assert.equal(resC.status, 200)
      assert.equal(resC.data.model, 'gemini-3.5-flash-lite')
      assert.equal(resC.data.fallbackUsed, true)
      assert.match(resC.data.aiDescription, /Fallback photo analysis/i)
      assert.equal(callsC.length, 2)

      const [[logC]] = await pool.query(
        'SELECT model, outcome, error_code FROM ai_usage_log WHERE user_id = ? ORDER BY id DESC LIMIT 1',
        [clientAId],
      )
      assert.equal(logC.model, 'gemini-3.5-flash-lite')
      assert.equal(logC.outcome, 'success')
      assert.equal(logC.error_code, 'FALLBACK_FROM_PROVIDER_429')

      // Scenario D: Primary times out (AbortError) -> fallback succeeds, no duplicate quota reservation
      const callsD = []
      setAiProviderForTesting({
        name: 'gemini-mock',
        getModel: () => 'gemini-3.8-flash',
        async generateGardenPlan(_input, opts = {}) {
          callsD.push(opts)
          if (!opts.isFallback) {
            const err = new Error('The operation was aborted')
            err.name = 'AbortError'
            throw err
          }
          return 'Fallback garden plan after primary timeout.'
        },
      })
      const resD = await apiRequest('/ai/garden-plan', {
        method: 'POST',
        cookie: clientACookie,
        body: { input: 'Scenario D timeout fallback' },
      })
      assert.equal(resD.status, 200)
      assert.equal(resD.data.model, 'gemini-3.5-flash-lite')
      assert.equal(resD.data.fallbackUsed, true)
      assert.equal(callsD.length, 2)

      const [[logD]] = await pool.query(
        'SELECT model, outcome, error_code FROM ai_usage_log WHERE user_id = ? ORDER BY id DESC LIMIT 1',
        [clientAId],
      )
      assert.equal(logD.model, 'gemini-3.5-flash-lite')
      assert.equal(logD.outcome, 'success')
      assert.equal(logD.error_code, 'FALLBACK_FROM_TIMEOUT')

      // Confirm exactly 4 quota slots used across Scenarios A, B, C, and D (no duplicate reservations)
      const usageAfterABCD = await apiRequest('/ai/usage', { cookie: clientACookie })
      assert.equal(usageAfterABCD.data.used, 4)
      assert.equal(usageAfterABCD.data.remaining, 6)

      // Scenario E: Primary returns HTTP 400 -> fallback is NOT invoked
      const callsE = []
      setAiProviderForTesting({
        name: 'gemini-mock',
        getModel: () => 'gemini-3.8-flash',
        async generateGardenPlan(_input, opts = {}) {
          callsE.push(opts)
          const err = new Error('Invalid generationConfig parameter')
          err.providerStatus = 400
          throw err
        },
      })
      const resE = await apiRequest('/ai/garden-plan', {
        method: 'POST',
        cookie: clientACookie,
        body: { input: 'Scenario E 400 no fallback' },
      })
      assert.equal(resE.status, 502)
      assert.equal(callsE.length, 1, 'Fallback must NOT be invoked on HTTP 400')
      const [[logE]] = await pool.query(
        'SELECT model, outcome, error_code FROM ai_usage_log WHERE user_id = ? ORDER BY id DESC LIMIT 1',
        [clientAId],
      )
      assert.equal(logE.model, 'gemini-3.8-flash')
      assert.equal(logE.outcome, 'error')
      assert.equal(logE.error_code, 'PROVIDER_400')

      // Scenario F: Primary returns HTTP 401 and HTTP 403 -> fallback is NOT invoked
      for (const status of [401, 403]) {
        const callsF = []
        setAiProviderForTesting({
          name: 'gemini-mock',
          getModel: () => 'gemini-3.8-flash',
          async generateGardenPlan(_input, opts = {}) {
            callsF.push(opts)
            const err = new Error(`Auth error ${status}`)
            err.providerStatus = status
            throw err
          },
        })
        const resF = await apiRequest('/ai/garden-plan', {
          method: 'POST',
          cookie: clientACookie,
          body: { input: `Scenario F ${status} no fallback` },
        })
        assert.equal(resF.status, 502)
        assert.equal(callsF.length, 1, `Fallback must NOT be invoked on HTTP ${status}`)
        const [[logF]] = await pool.query(
          'SELECT model, outcome, error_code FROM ai_usage_log WHERE user_id = ? ORDER BY id DESC LIMIT 1',
          [clientAId],
        )
        assert.equal(logF.model, 'gemini-3.8-flash')
        assert.equal(logF.outcome, 'error')
        assert.equal(logF.error_code, `PROVIDER_${status}`)
      }

      // Scenario G: Both models fail -> controlled error returned, usage finalized with both models/codes, 1 slot consumed
      const callsG = []
      setAiProviderForTesting({
        name: 'gemini-mock',
        getModel: () => 'gemini-3.8-flash',
        async generateGardenPlan(_input, opts = {}) {
          callsG.push(opts)
          const err = new Error(opts.isFallback ? 'Fallback also overloaded' : 'Primary overloaded')
          err.providerStatus = 503
          throw err
        },
      })
      const resG = await apiRequest('/ai/garden-plan', {
        method: 'POST',
        cookie: clientACookie,
        body: { input: 'Scenario G both models fail' },
      })
      assert.equal(resG.status, 503)
      assert.match(resG.data.message, /temporarily busy/i)
      assert.equal(callsG.length, 2, 'Must attempt primary once and fallback once')

      const [[logG]] = await pool.query(
        'SELECT model, outcome, error_code FROM ai_usage_log WHERE user_id = ? ORDER BY id DESC LIMIT 1',
        [clientAId],
      )
      assert.equal(logG.model, 'gemini-3.8-flash->gemini-3.5-flash-lite')
      assert.equal(logG.outcome, 'error')
      assert.equal(logG.error_code, 'FALLBACK_FAILED:PROVIDER_503->PROVIDER_503')

      // Total operations across A(1) + B(1) + C(1) + D(1) + E(1) + F(2) + G(1) = 8 quota slots consumed
      const usageFinal = await apiRequest('/ai/usage', { cookie: clientACookie })
      assert.equal(usageFinal.data.used, 8)
      assert.equal(usageFinal.data.remaining, 2)
    } finally {
      if (originalFallbackEnv === undefined) {
        delete process.env.GEMINI_FALLBACK_MODEL
      } else {
        process.env.GEMINI_FALLBACK_MODEL = originalFallbackEnv
      }
      resetAiProvider()
      await pool.execute('DELETE FROM ai_usage_log WHERE user_id = ?', [clientAId])
    }
  })

  test('R6-09: Concurrent Fallback Verification (Scenario H) — 15 simultaneous requests with primary 503 -> fallback never exceed 10 quota slots', async () => {
    const originalFallbackEnv = process.env.GEMINI_FALLBACK_MODEL
    process.env.GEMINI_FALLBACK_MODEL = 'gemini-3.5-flash-lite'
    await pool.execute('DELETE FROM ai_usage_log WHERE user_id = ?', [clientAId])

    let primaryCalls = 0
    let fallbackCalls = 0

    setAiProviderForTesting({
      name: 'gemini-mock',
      getModel: () => 'gemini-3.8-flash',
      async generateGardenPlan(input, opts = {}) {
        await new Promise((resolve) => setTimeout(resolve, 25))
        if (!opts.isFallback) {
          primaryCalls += 1
          const err = new Error('Primary 503 under concurrency')
          err.providerStatus = 503
          throw err
        }
        fallbackCalls += 1
        return `Fallback concurrent plan for ${input}`
      },
    })

    try {
      const requests = Array.from({ length: 15 }, (_, idx) => (
        apiRequest('/ai/garden-plan', {
          method: 'POST',
          cookie: clientACookie,
          body: { input: `Concurrent fallback request #${idx + 1}` },
        })
      ))

      const responses = await Promise.all(requests)
      const okResponses = responses.filter((r) => r.status === 200)
      const rateLimitedResponses = responses.filter((r) => r.status === 429)

      assert.equal(okResponses.length, 10, 'Exactly 10 requests should succeed via fallback')
      assert.equal(rateLimitedResponses.length, 5, 'Exactly 5 requests should be rate-limited (429)')
      assert.equal(primaryCalls, 10, 'At most 10 primary calls allowed for 10 reserved slots')
      assert.equal(fallbackCalls, 10, 'At most 10 fallback calls allowed for 10 reserved slots')
      assert.ok(okResponses.every((r) => r.data.model === 'gemini-3.5-flash-lite' && r.data.fallbackUsed === true))

      const [logRows] = await pool.query(
        'SELECT model, outcome, error_code FROM ai_usage_log WHERE user_id = ?',
        [clientAId],
      )
      const fallbackSuccessRows = logRows.filter(
        (r) => r.outcome === 'success' && r.model === 'gemini-3.5-flash-lite' && r.error_code === 'FALLBACK_FROM_PROVIDER_503',
      )
      const rateLimitedRows = logRows.filter(
        (r) => r.outcome === 'rate_limited' && r.error_code === 'RATE_LIMIT_EXCEEDED',
      )
      assert.equal(fallbackSuccessRows.length, 10)
      assert.equal(rateLimitedRows.length, 5)
    } finally {
      if (originalFallbackEnv === undefined) {
        delete process.env.GEMINI_FALLBACK_MODEL
      } else {
        process.env.GEMINI_FALLBACK_MODEL = originalFallbackEnv
      }
      resetAiProvider()
      await pool.execute('DELETE FROM ai_usage_log WHERE user_id = ?', [clientAId])
    }
  })
})
