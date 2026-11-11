const path = require('node:path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true })

// Enforce that R2 tests run EXCLUSIVELY against the separate test database
const ORIGINAL_DB = process.env.DB_NAME || 'hugatiera_db'
process.env.DB_NAME = 'hugatiera_db_migration_test'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const http = require('node:http')
const { after, before, describe, test } = require('node:test')
const sharp = require('sharp')

const app = require('../app')
const { pool } = require('../config/database')
const {
  attachImagesToInquiry,
  cleanupOrphanedRequestImages,
  startOrphanCleanupSchedule,
  stopOrphanCleanupSchedule,
} = require('../controllers/requestImage.controller')
const {
  requestImageOriginalsDirectory,
  resolveRequestImagePath,
} = require('../middleware/upload.middleware')

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

async function apiRequest(urlPath, { method = 'GET', body, cookie = '', headers = {}, rawResponse = false } = {}) {
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

  if (rawResponse) {
    const buffer = Buffer.from(await response.arrayBuffer())
    return {
      status: response.status,
      buffer,
      headers: response.headers,
    }
  }

  const data = response.status === 204 ? null : await response.json().catch(() => null)
  return {
    status: response.status,
    data,
    cookie: extractCookie(response) || cookie,
    headers: response.headers,
  }
}

function makeUploadForm(buffer, filename, mimeType, inquiryId = null) {
  const form = new FormData()
  form.append('image', new Blob([buffer], { type: mimeType }), filename)
  if (inquiryId !== null && inquiryId !== undefined) {
    form.append('inquiryId', String(inquiryId))
  }
  return form
}

describe('Step R2 – Garden Photo Upload, sharp EXIF/GPS Stripping & Access Control', () => {
  const runId = Date.now()
  let clientACookie = ''
  let clientBCookie = ''
  let gardener1Cookie = '' // approved gardener (targeted / offer owner)
  let gardener2Cookie = '' // approved gardener (browsing open board, no offer)
  let gardener3Cookie = '' // unapproved gardener
  let adminCookie = ''

  let clientAId = null
  let clientBId = null
  let gardener1Id = null
  let gardener2Id = null
  let gardener3Id = null
  let adminId = null

  let draftImageId = null
  let directInquiryId = null
  let directImageId = null
  let generalInquiryId = null
  let generalImageId = null

  before(async () => {
    const [[dbRow]] = await pool.query('SELECT DATABASE() AS db')
    assert.equal(
      dbRow.db,
      'hugatiera_db_migration_test',
      `Refusing to run R2 tests on ${dbRow.db}; must be hugatiera_db_migration_test`,
    )
    assert.notEqual(dbRow.db, ORIGINAL_DB, 'Must never run against original database')

    server = http.createServer(app)
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const { port } = server.address()
    baseUrl = `http://127.0.0.1:${port}`

    // Register Client A, Client B, Gardener 1, Gardener 2, Gardener 3
    const regClientA = await apiRequest('/api/auth/register', {
      method: 'POST',
      body: {
        firstName: 'ClientA',
        lastName: 'R2Test',
        email: `r2.clienta.${runId}@hugatiera.test`,
        password: 'Password123',
        role: 'client',
      },
    })
    assert.equal(regClientA.status, 201)
    clientACookie = regClientA.cookie
    clientAId = regClientA.data.user.id
    createdUserIds.push(clientAId)

    const regClientB = await apiRequest('/api/auth/register', {
      method: 'POST',
      body: {
        firstName: 'ClientB',
        lastName: 'R2Test',
        email: `r2.clientb.${runId}@hugatiera.test`,
        password: 'Password123',
        role: 'client',
      },
    })
    assert.equal(regClientB.status, 201)
    clientBCookie = regClientB.cookie
    clientBId = regClientB.data.user.id
    createdUserIds.push(clientBId)

    const regGardener1 = await apiRequest('/api/auth/register', {
      method: 'POST',
      body: {
        firstName: 'GardenerOne',
        lastName: 'R2Test',
        email: `r2.gardener1.${runId}@hugatiera.test`,
        password: 'Password123',
        role: 'gardener',
      },
    })
    assert.equal(regGardener1.status, 201)
    gardener1Cookie = regGardener1.cookie
    gardener1Id = regGardener1.data.user.id
    createdUserIds.push(gardener1Id)

    const regGardener2 = await apiRequest('/api/auth/register', {
      method: 'POST',
      body: {
        firstName: 'GardenerTwo',
        lastName: 'R2Test',
        email: `r2.gardener2.${runId}@hugatiera.test`,
        password: 'Password123',
        role: 'gardener',
      },
    })
    assert.equal(regGardener2.status, 201)
    gardener2Cookie = regGardener2.cookie
    gardener2Id = regGardener2.data.user.id
    createdUserIds.push(gardener2Id)

    const regGardener3 = await apiRequest('/api/auth/register', {
      method: 'POST',
      body: {
        firstName: 'GardenerThree',
        lastName: 'R2Test',
        email: `r2.gardener3.${runId}@hugatiera.test`,
        password: 'Password123',
        role: 'gardener',
      },
    })
    assert.equal(regGardener3.status, 201)
    gardener3Cookie = regGardener3.cookie
    gardener3Id = regGardener3.data.user.id
    createdUserIds.push(gardener3Id)

    // Approve Gardener 1 and Gardener 2; leave Gardener 3 unapproved
    await pool.execute('UPDATE gardener_profiles SET is_approved = TRUE WHERE user_id IN (?, ?)', [
      gardener1Id,
      gardener2Id,
    ])
    await pool.execute('UPDATE gardener_profiles SET is_approved = FALSE WHERE user_id = ?', [
      gardener3Id,
    ])

    // Create temporary administrator user for moderation access test
    const bcrypt = require('bcryptjs')
    const hash = await bcrypt.hash('Password123', 10)
    const [adminIns] = await pool.execute(
      `INSERT INTO users (email, password_hash, role, first_name, last_name, is_active)
       VALUES (?, ?, 'administrator', 'R2Admin', 'Tester', TRUE)`,
      [`r2.admin.${runId}@hugatiera.test`, hash],
    )
    adminId = adminIns.insertId
    createdUserIds.push(adminId)

    const adminLogin = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: {
        email: `r2.admin.${runId}@hugatiera.test`,
        password: 'Password123',
      },
    })
    assert.equal(adminLogin.status, 200)
    adminCookie = adminLogin.cookie
  })

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve))
    }

    // Clean up any files written by test uploads
    if (createdUserIds.length > 0) {
      const placeholders = createdUserIds.map(() => '?').join(', ')
      const [imgRows] = await pool.execute(
        `SELECT file_path FROM request_images WHERE uploaded_by IN (${placeholders})`,
        createdUserIds,
      )
      for (const row of imgRows) {
        try {
          const abs = resolveRequestImagePath(row.file_path)
          await fsp.unlink(abs).catch(() => {})
        } catch {
          // ignore
        }
      }
      await pool.execute(
        `DELETE FROM request_images WHERE uploaded_by IN (${placeholders})`,
        createdUserIds,
      )
    }

    for (const filePath of createdImageFiles) {
      await fsp.unlink(filePath).catch(() => {})
    }

    if (createdInquiryIds.length > 0) {
      const placeholders = createdInquiryIds.map(() => '?').join(', ')
      await pool.execute(`DELETE FROM quotations WHERE inquiry_id IN (${placeholders})`, createdInquiryIds)
      await pool.execute(`DELETE FROM inquiries WHERE id IN (${placeholders})`, createdInquiryIds)
    }

    if (createdUserIds.length > 0) {
      const placeholders = createdUserIds.map(() => '?').join(', ')
      await pool.execute(`DELETE FROM client_profiles WHERE user_id IN (${placeholders})`, createdUserIds)
      await pool.execute(`DELETE FROM gardener_profiles WHERE user_id IN (${placeholders})`, createdUserIds)
      await pool.execute(`DELETE FROM users WHERE id IN (${placeholders})`, createdUserIds)
    }

    await pool.end()
  })

  test('R2-01: Authentication & role guards on upload endpoint', async () => {
    const validPng = await sharp({
      create: { width: 100, height: 100, channels: 3, background: { r: 40, g: 120, b: 60 } },
    }).png().toBuffer()

    // Unauthenticated upload -> 401
    const unauth = await apiRequest('/api/request-images', {
      method: 'POST',
      body: makeUploadForm(validPng, 'garden.png', 'image/png'),
    })
    assert.equal(unauth.status, 401)

    // Gardener role attempting to upload a client request photo -> 403
    const asGardener = await apiRequest('/api/request-images', {
      method: 'POST',
      cookie: gardener1Cookie,
      body: makeUploadForm(validPng, 'garden.png', 'image/png'),
    })
    assert.equal(asGardener.status, 403)
  })

  test('R2-02: Rejects missing file, invalid MIME, spoofed content, and corrupted image bytes without writing to disk', async () => {
    const filesBefore = fs.readdirSync(requestImageOriginalsDirectory).length

    // 1. Missing file
    const noFile = await apiRequest('/api/request-images', {
      method: 'POST',
      cookie: clientACookie,
      body: new FormData(),
    })
    assert.equal(noFile.status, 400)

    // 2. Disallowed MIME type (text/plain)
    const badMime = await apiRequest('/api/request-images', {
      method: 'POST',
      cookie: clientACookie,
      body: makeUploadForm(Buffer.from('hello world'), 'notes.txt', 'text/plain'),
    })
    assert.equal(badMime.status, 400)
    assert.match(badMime.data.message, /JPEG, PNG, and WebP/i)

    // 3. Spoofed MIME type: claims image/jpeg + .jpg, but content is HTML/script text
    const spoofed = await apiRequest('/api/request-images', {
      method: 'POST',
      cookie: clientACookie,
      body: makeUploadForm(Buffer.from('<html><script>alert(1)</script></html>'), 'fake.jpg', 'image/jpeg'),
    })
    assert.equal(spoofed.status, 400)
    assert.match(spoofed.data.message, /Invalid image file content/i)

    // 4. Starts with JPEG magic bytes (FF D8 FF E0) followed by undecodable garbage
    const corruptJpeg = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]),
      Buffer.from('corrupted-non-image-payload-1234567890'),
    ])
    const corruptRes = await apiRequest('/api/request-images', {
      method: 'POST',
      cookie: clientACookie,
      body: makeUploadForm(corruptJpeg, 'corrupt.jpg', 'image/jpeg'),
    })
    assert.equal(corruptRes.status, 400)
    assert.match(corruptRes.data.message, /Invalid or corrupted image file/i)

    // Confirm zero files were written to originals/ by failed uploads
    const filesAfter = fs.readdirSync(requestImageOriginalsDirectory).length
    assert.equal(filesAfter, filesBefore)
  })

  test('R2-03: Decodes with sharp, applies orientation, resizes oversized dimensions, and strips ALL EXIF & GPS metadata', async () => {
    // Create a 2400x1600 JPEG with EXIF Orientation=6 and explicit EXIF + GPS coordinates (Zamboanga City)
    const sourceBuffer = await sharp({
      create: { width: 2400, height: 1600, channels: 3, background: { r: 34, g: 139, b: 34 } },
    })
      .withMetadata({
        orientation: 6,
        exif: {
          IFD0: {
            Make: 'HugaTieraTestCamera',
            Model: 'GardenCamPro',
            Software: 'SecretEXIFSoftware',
          },
          IFD3: {
            GPSLatitudeRef: 'N',
            GPSLatitude: '6/1 55/1 17/1',
            GPSLongitudeRef: 'E',
            GPSLongitude: '122/1 4/1 44/1',
          },
        },
      })
      .jpeg({ quality: 92 })
      .toBuffer()

    // Confirm sourceBuffer genuinely contains EXIF metadata and marker strings before upload
    const beforeMeta = await sharp(sourceBuffer).metadata()
    assert.ok(beforeMeta.exif, 'Test fixture must contain EXIF buffer prior to upload')
    assert.equal(beforeMeta.orientation, 6)
    assert.ok(sourceBuffer.includes(Buffer.from('HugaTieraTestCamera')))

    // Upload as Client A (unattached draft photo)
    const uploadRes = await apiRequest('/api/request-images', {
      method: 'POST',
      cookie: clientACookie,
      body: makeUploadForm(sourceBuffer, 'garden_with_gps.jpg', 'image/jpeg'),
    })
    assert.equal(uploadRes.status, 201)
    assert.ok(uploadRes.data.image.id)
    assert.equal(uploadRes.data.image.kind, 'original')
    assert.equal(uploadRes.data.image.mime_type, 'image/jpeg')
    assert.equal(uploadRes.data.image.inquiry_id, null)
    // Internal disk path must never be leaked in API responses
    assert.equal(uploadRes.data.image.file_path, undefined)

    draftImageId = uploadRes.data.image.id

    // Verify stored row in database and file on disk under originals/
    const [[dbImg]] = await pool.execute('SELECT * FROM request_images WHERE id = ?', [draftImageId])
    assert.ok(dbImg.file_path.startsWith('originals/'))
    const diskPath = resolveRequestImagePath(dbImg.file_path)
    createdImageFiles.push(diskPath)
    const savedBytes = await fsp.readFile(diskPath)

    // Inspect cleaned image metadata with sharp
    const afterMeta = await sharp(savedBytes).metadata()
    assert.equal(afterMeta.format, 'jpeg')
    assert.equal(afterMeta.exif, undefined, 'EXIF metadata must be completely stripped')
    assert.equal(afterMeta.xmp, undefined, 'XMP metadata must be completely stripped')
    assert.equal(afterMeta.iptc, undefined, 'IPTC metadata must be completely stripped')
    assert.equal(afterMeta.orientation, undefined, 'EXIF orientation tag must be stripped after rotating pixels')
    // Orientation 6 rotated 2400x1600 -> 1600x2400, then resized inside 1920x1920 -> 1280x1920
    assert.ok(afterMeta.width <= 1920 && afterMeta.height <= 1920, 'Image must be resized within 1920x1920')
    assert.equal(afterMeta.height, 1920)
    assert.equal(afterMeta.width, 1280)

    // Confirm raw bytes no longer contain any camera/GPS strings
    assert.equal(savedBytes.includes(Buffer.from('HugaTieraTestCamera')), false)
    assert.equal(savedBytes.includes(Buffer.from('SecretEXIFSoftware')), false)

    // Also test PNG and WebP uploads succeed and strip metadata
    const pngBuf = await sharp({
      create: { width: 200, height: 150, channels: 4, background: { r: 10, g: 200, b: 90, alpha: 1 } },
    }).png().toBuffer()
    const pngRes = await apiRequest('/api/request-images', {
      method: 'POST',
      cookie: clientACookie,
      body: makeUploadForm(pngBuf, 'lawn.png', 'image/png'),
    })
    assert.equal(pngRes.status, 201)
    assert.equal(pngRes.data.image.mime_type, 'image/png')

    const webpBuf = await sharp({
      create: { width: 200, height: 150, channels: 3, background: { r: 80, g: 160, b: 40 } },
    }).webp().toBuffer()
    const webpRes = await apiRequest('/api/request-images', {
      method: 'POST',
      cookie: clientACookie,
      body: makeUploadForm(webpBuf, 'terrace.webp', 'image/webp'),
    })
    assert.equal(webpRes.status, 201)
    assert.equal(webpRes.data.image.mime_type, 'image/webp')
  })

  test('R2-04: Storage security – no public static serving and path traversal is blocked', async () => {
    const [[dbImg]] = await pool.execute('SELECT file_path FROM request_images WHERE id = ?', [draftImageId])

    // Attempt to fetch via public /uploads/... URLs -> must 404
    const pub1 = await apiRequest(`/uploads/request-images/${dbImg.file_path}`)
    assert.equal(pub1.status, 404)
    const pub2 = await apiRequest(`/uploads/${dbImg.file_path}`)
    assert.equal(pub2.status, 404)

    // Path traversal helper must throw 400
    assert.throws(() => resolveRequestImagePath('../../.env'), /Invalid image file path/)
    assert.throws(() => resolveRequestImagePath('../portfolios/some.jpg'), /Invalid image file path/)
  })

  test('R2-05: Access control on unattached draft image (owner + admin only)', async () => {
    // Unauthenticated -> 401
    const unauth = await apiRequest(`/api/request-images/${draftImageId}`)
    assert.equal(unauth.status, 401)

    // Owning client (Client A) -> 200 with security headers
    const ownerRes = await apiRequest(`/api/request-images/${draftImageId}`, {
      cookie: clientACookie,
      rawResponse: true,
    })
    assert.equal(ownerRes.status, 200)
    assert.equal(ownerRes.headers.get('content-type'), 'image/jpeg')
    assert.equal(ownerRes.headers.get('cache-control'), 'private, no-store')
    assert.equal(ownerRes.headers.get('x-content-type-options'), 'nosniff')
    assert.ok(ownerRes.buffer.length > 100)

    // Another client (Client B) -> 403
    const otherClient = await apiRequest(`/api/request-images/${draftImageId}`, {
      cookie: clientBCookie,
    })
    assert.equal(otherClient.status, 403)

    // Approved gardener on unattached draft -> 403
    const gardenerDraft = await apiRequest(`/api/request-images/${draftImageId}`, {
      cookie: gardener1Cookie,
    })
    assert.equal(gardenerDraft.status, 403)

    // Administrator -> 200
    const adminRes = await apiRequest(`/api/request-images/${draftImageId}`, {
      cookie: adminCookie,
      rawResponse: true,
    })
    assert.equal(adminRes.status, 200)
  })

  test('R2-06: Access control on Case 2 Direct Inquiry photos (owning client + targeted provider only)', async () => {
    // Create a Case 2 direct inquiry from Client A to Gardener 1
    const [inqIns] = await pool.execute(
      `INSERT INTO inquiries (request_type, client_id, gardener_id, subject, description, status)
       VALUES ('direct', ?, ?, 'Case 2 Hedge Trimming', 'Need front hedge trimmed', 'open')`,
      [clientAId, gardener1Id],
    )
    directInquiryId = inqIns.insertId
    createdInquiryIds.push(directInquiryId)

    // Upload a photo directly attached to directInquiryId
    const imgBuf = await sharp({
      create: { width: 120, height: 90, channels: 3, background: { r: 20, g: 100, b: 50 } },
    }).jpeg().toBuffer()

    const upRes = await apiRequest('/api/request-images', {
      method: 'POST',
      cookie: clientACookie,
      body: makeUploadForm(imgBuf, 'direct_hedge.jpg', 'image/jpeg', directInquiryId),
    })
    assert.equal(upRes.status, 201)
    assert.equal(upRes.data.image.inquiry_id, directInquiryId)
    directImageId = upRes.data.image.id

    // Client B cannot attach an image to Client A's inquiry -> 404
    const hijackRes = await apiRequest('/api/request-images', {
      method: 'POST',
      cookie: clientBCookie,
      body: makeUploadForm(imgBuf, 'hijack.jpg', 'image/jpeg', directInquiryId),
    })
    assert.equal(hijackRes.status, 404)

    // Owning client (Client A) can view and list -> 200
    assert.equal((await apiRequest(`/api/request-images/${directImageId}`, { cookie: clientACookie, rawResponse: true })).status, 200)
    const listClient = await apiRequest(`/api/request-images/inquiry/${directInquiryId}`, { cookie: clientACookie })
    assert.equal(listClient.status, 200)
    assert.equal(listClient.data.images.length, 1)

    // Targeted provider (Gardener 1) can view and list -> 200
    assert.equal((await apiRequest(`/api/request-images/${directImageId}`, { cookie: gardener1Cookie, rawResponse: true })).status, 200)
    const listG1 = await apiRequest(`/api/request-images/inquiry/${directInquiryId}`, { cookie: gardener1Cookie })
    assert.equal(listG1.status, 200)
    assert.equal(listG1.data.images.length, 1)

    // Another approved gardener (Gardener 2, NOT targeted) -> 403 on both image file and list
    assert.equal((await apiRequest(`/api/request-images/${directImageId}`, { cookie: gardener2Cookie })).status, 403)
    assert.equal((await apiRequest(`/api/request-images/inquiry/${directInquiryId}`, { cookie: gardener2Cookie })).status, 403)

    // Another client (Client B) -> 403
    assert.equal((await apiRequest(`/api/request-images/${directImageId}`, { cookie: clientBCookie })).status, 403)
  })

  test('R2-07: Access control on Case 1 General Request photos (approved providers while open; offer-holders after expiry/selection)', async () => {
    // Create an open Case 1 general request (gardener_id IS NULL, expires in +14 days)
    const [genIns] = await pool.execute(
      `INSERT INTO inquiries (request_type, client_id, gardener_id, subject, description, status, expires_at)
       VALUES ('general', ?, NULL, 'Case 1 Backyard Cleanup', 'Overgrown lawn and weeds', 'open', DATE_ADD(NOW(), INTERVAL 14 DAY))`,
      [clientAId],
    )
    generalInquiryId = genIns.insertId
    createdInquiryIds.push(generalInquiryId)

    // Attach the earlier draftImageId to generalInquiryId using attachImagesToInquiry inside a transaction
    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      const attached = await attachImagesToInquiry(conn, {
        inquiryId: generalInquiryId,
        clientId: clientAId,
        imageIds: [draftImageId],
      })
      assert.deepEqual(attached, [draftImageId])
      await conn.commit()
    } finally {
      conn.release()
    }
    generalImageId = draftImageId

    // 1. While open & non-expired:
    // Approved Gardener 1 -> 200
    assert.equal((await apiRequest(`/api/request-images/${generalImageId}`, { cookie: gardener1Cookie, rawResponse: true })).status, 200)
    // Approved Gardener 2 -> 200
    assert.equal((await apiRequest(`/api/request-images/${generalImageId}`, { cookie: gardener2Cookie, rawResponse: true })).status, 200)
    // Unapproved Gardener 3 -> 403
    assert.equal((await apiRequest(`/api/request-images/${generalImageId}`, { cookie: gardener3Cookie })).status, 403)
    // Other Client B -> 403
    assert.equal((await apiRequest(`/api/request-images/${generalImageId}`, { cookie: clientBCookie })).status, 403)

    // 2. Gardener 1 submits an offer on generalInquiryId; then the request expires
    await pool.execute(
      `INSERT INTO quotations (inquiry_id, gardener_id, amount, details, status, response_type)
       VALUES (?, ?, 1500.00, 'Can clean backyard this Saturday', 'sent', 'offer')`,
      [generalInquiryId, gardener1Id],
    )
    await pool.execute(
      "UPDATE inquiries SET expires_at = DATE_SUB(NOW(), INTERVAL 1 HOUR), status = 'expired' WHERE id = ?",
      [generalInquiryId],
    )

    // Gardener 1 (who submitted an offer) can STILL view the photo -> 200
    assert.equal((await apiRequest(`/api/request-images/${generalImageId}`, { cookie: gardener1Cookie, rawResponse: true })).status, 200)
    // Gardener 2 (approved, but never submitted an offer on the now-expired request) -> 403
    assert.equal((await apiRequest(`/api/request-images/${generalImageId}`, { cookie: gardener2Cookie })).status, 403)
  })

  test('R2-08: Orphaned draft cleanup and client deletion lifecycle', async () => {
    const imgBuf = await sharp({
      create: { width: 90, height: 90, channels: 3, background: { r: 120, g: 80, b: 40 } },
    }).jpeg().toBuffer()

    // Upload a new unattached draft image
    const tempUp = await apiRequest('/api/request-images', {
      method: 'POST',
      cookie: clientACookie,
      body: makeUploadForm(imgBuf, 'to_delete.jpg', 'image/jpeg'),
    })
    assert.equal(tempUp.status, 201)
    const tempId = tempUp.data.image.id

    const [[tempRow]] = await pool.execute('SELECT file_path FROM request_images WHERE id = ?', [tempId])
    const tempAbsPath = resolveRequestImagePath(tempRow.file_path)
    assert.equal(fs.existsSync(tempAbsPath), true)

    // Client B cannot delete Client A's image -> 404
    const wrongDel = await apiRequest(`/api/request-images/${tempId}`, {
      method: 'DELETE',
      cookie: clientBCookie,
    })
    assert.equal(wrongDel.status, 404)

    // Client A deletes their own unattached draft image -> 204, row and disk file removed
    const okDel = await apiRequest(`/api/request-images/${tempId}`, {
      method: 'DELETE',
      cookie: clientACookie,
    })
    assert.equal(okDel.status, 204)
    assert.equal(fs.existsSync(tempAbsPath), false)
    assert.equal((await apiRequest(`/api/request-images/${tempId}`, { cookie: clientACookie })).status, 404)

    // Cannot delete an image attached to a request that is no longer 'open' (generalImageId is on 'expired' request)
    const lockedDel = await apiRequest(`/api/request-images/${generalImageId}`, {
      method: 'DELETE',
      cookie: clientACookie,
    })
    assert.equal(lockedDel.status, 400)

    // Test cleanupOrphanedRequestImages() removes aged unattached rows + disk files
    const orphanUp = await apiRequest('/api/request-images', {
      method: 'POST',
      cookie: clientACookie,
      body: makeUploadForm(imgBuf, 'abandoned_draft.jpg', 'image/jpeg'),
    })
    assert.equal(orphanUp.status, 201)
    const orphanId = orphanUp.data.image.id
    const [[orphanRow]] = await pool.execute('SELECT file_path FROM request_images WHERE id = ?', [orphanId])
    const orphanAbsPath = resolveRequestImagePath(orphanRow.file_path)

    // Backdate created_at by 48 hours
    await pool.execute(
      'UPDATE request_images SET created_at = DATE_SUB(NOW(), INTERVAL 48 HOUR) WHERE id = ?',
      [orphanId],
    )
    const cleanedCount = await cleanupOrphanedRequestImages(24)
    assert.ok(cleanedCount >= 1)
    assert.equal(fs.existsSync(orphanAbsPath), false)
    const [afterOrphan] = await pool.execute('SELECT id FROM request_images WHERE id = ?', [orphanId])
    assert.equal(afterOrphan.length, 0)
  })

  test('R2-09: Automatic orphan cleanup via both scheduled interval and upload trigger', async () => {
    const imgBuf = await sharp({
      create: { width: 80, height: 80, channels: 3, background: { r: 60, g: 140, b: 80 } },
    }).jpeg().toBuffer()

    // 1. Verify automatic cleanup triggered during POST /api/request-images
    const staleUp = await apiRequest('/api/request-images', {
      method: 'POST',
      cookie: clientACookie,
      body: makeUploadForm(imgBuf, 'stale_before_upload.jpg', 'image/jpeg'),
    })
    assert.equal(staleUp.status, 201)
    const staleId = staleUp.data.image.id
    const [[staleRow]] = await pool.execute('SELECT file_path FROM request_images WHERE id = ?', [staleId])
    const staleAbsPath = resolveRequestImagePath(staleRow.file_path)

    await pool.execute(
      'UPDATE request_images SET created_at = DATE_SUB(NOW(), INTERVAL 36 HOUR) WHERE id = ?',
      [staleId],
    )

    // Uploading a new photo automatically cleans up staleId without calling cleanupOrphanedRequestImages manually
    const triggerUp = await apiRequest('/api/request-images', {
      method: 'POST',
      cookie: clientACookie,
      body: makeUploadForm(imgBuf, 'trigger.jpg', 'image/jpeg'),
    })
    assert.equal(triggerUp.status, 201)
    assert.equal(fs.existsSync(staleAbsPath), false)
    const [staleCheck] = await pool.execute('SELECT id FROM request_images WHERE id = ?', [staleId])
    assert.equal(staleCheck.length, 0)

    // 2. Verify startOrphanCleanupSchedule / stopOrphanCleanupSchedule runs periodically
    await pool.execute(
      'UPDATE request_images SET created_at = DATE_SUB(NOW(), INTERVAL 36 HOUR) WHERE id = ?',
      [triggerUp.data.image.id],
    )
    const handle = startOrphanCleanupSchedule(50, 24)
    assert.ok(handle)
    await new Promise((resolve) => setTimeout(resolve, 180))
    stopOrphanCleanupSchedule()

    const [afterScheduled] = await pool.execute(
      'SELECT id FROM request_images WHERE id = ?',
      [triggerUp.data.image.id],
    )
    assert.equal(afterScheduled.length, 0)
  })

  test('R2-10: Database/file consistency when unlink fails transiently and disk-orphan recovery sweep', async () => {
    const imgBuf = await sharp({
      create: { width: 80, height: 80, channels: 3, background: { r: 90, g: 110, b: 50 } },
    }).jpeg().toBuffer()

    const up = await apiRequest('/api/request-images', {
      method: 'POST',
      cookie: clientACookie,
      body: makeUploadForm(imgBuf, 'transient_lock.jpg', 'image/jpeg'),
    })
    assert.equal(up.status, 201)
    const imgId = up.data.image.id
    const [[row]] = await pool.execute('SELECT file_path FROM request_images WHERE id = ?', [imgId])
    const absPath = resolveRequestImagePath(row.file_path)

    // Backdate row so it qualifies for orphan cleanup
    await pool.execute(
      'UPDATE request_images SET created_at = DATE_SUB(NOW(), INTERVAL 30 HOUR) WHERE id = ?',
      [imgId],
    )

    // Simulate a transient EBUSY/EPERM unlink failure during step 1 and step 2
    const failingUnlink = async () => {
      const err = new Error('Simulated Windows file lock')
      err.code = 'EBUSY'
      throw err
    }

    await cleanupOrphanedRequestImages(24, { diskGraceMs: 0, unlinkFn: failingUnlink })

    // DB row was deleted cleanly despite unlink failure, and the server did not crash
    const [dbCheck] = await pool.execute('SELECT id FROM request_images WHERE id = ?', [imgId])
    assert.equal(dbCheck.length, 0)
    // File is still on disk because unlink failed
    assert.equal(fs.existsSync(absPath), true)

    // Next cleanup pass (with normal fsp.unlink and diskGraceMs=0) sweeps and removes the unreferenced disk file!
    await cleanupOrphanedRequestImages(24, { diskGraceMs: 0 })
    assert.equal(fs.existsSync(absPath), false)
  })

  test('R2-11: Correct MIME normalization and binary delivery across JPEG, PNG, and WebP (including mismatched header)', async () => {
    // Create a valid PNG buffer, but upload it with a mismatched Content-Type: image/jpeg and .jpg filename
    const pngBytes = await sharp({
      create: { width: 140, height: 100, channels: 4, background: { r: 25, g: 150, b: 190, alpha: 1 } },
    }).png().toBuffer()

    const mismatchUp = await apiRequest('/api/request-images', {
      method: 'POST',
      cookie: clientACookie,
      body: makeUploadForm(pngBytes, 'actually_a_png.jpg', 'image/jpeg'),
    })
    assert.equal(mismatchUp.status, 201)
    // Backend must record the actual decoded format (image/png), NOT the client-claimed header!
    assert.equal(mismatchUp.data.image.mime_type, 'image/png')

    const getPng = await apiRequest(`/api/request-images/${mismatchUp.data.image.id}`, {
      cookie: clientACookie,
      rawResponse: true,
    })
    assert.equal(getPng.status, 200)
    assert.equal(getPng.headers.get('content-type'), 'image/png')
    assert.equal(getPng.headers.get('cache-control'), 'private, no-store')
    assert.equal(getPng.headers.get('x-content-type-options'), 'nosniff')

    // Verify downloaded binary decodes cleanly as a 140x100 PNG
    const decoded = await sharp(getPng.buffer).metadata()
    assert.equal(decoded.format, 'png')
    assert.equal(decoded.width, 140)
    assert.equal(decoded.height, 100)
  })

  test('R2-12: Authorization edge cases – revoked gardener approval, closed request, deactivated user, and deleted request cascade', async () => {
    // Create a new open Case 1 general request with an attached photo
    const [inqIns] = await pool.execute(
      `INSERT INTO inquiries (request_type, client_id, gardener_id, subject, description, status, expires_at)
       VALUES ('general', ?, NULL, 'Edge Case Request', 'Test edge cases', 'open', DATE_ADD(NOW(), INTERVAL 7 DAY))`,
      [clientAId],
    )
    const edgeInquiryId = inqIns.insertId
    createdInquiryIds.push(edgeInquiryId)

    const imgBuf = await sharp({
      create: { width: 100, height: 100, channels: 3, background: { r: 70, g: 130, b: 90 } },
    }).webp().toBuffer()

    const up = await apiRequest('/api/request-images', {
      method: 'POST',
      cookie: clientACookie,
      body: makeUploadForm(imgBuf, 'edge.webp', 'image/webp', edgeInquiryId),
    })
    assert.equal(up.status, 201)
    const edgeImgId = up.data.image.id
    const [[edgeImgRow]] = await pool.execute('SELECT file_path FROM request_images WHERE id = ?', [edgeImgId])
    const edgeAbsPath = resolveRequestImagePath(edgeImgRow.file_path)

    // 1. Gardener 2 (currently approved, no offer) can view -> 200
    assert.equal(
      (await apiRequest(`/api/request-images/${edgeImgId}`, { cookie: gardener2Cookie, rawResponse: true })).status,
      200,
    )

    // 2. Revoke Gardener 2's approval (is_approved = FALSE) -> immediately loses access (403)
    await pool.execute('UPDATE gardener_profiles SET is_approved = FALSE WHERE user_id = ?', [gardener2Id])
    assert.equal(
      (await apiRequest(`/api/request-images/${edgeImgId}`, { cookie: gardener2Cookie })).status,
      403,
    )
    assert.equal(
      (await apiRequest(`/api/request-images/inquiry/${edgeInquiryId}`, { cookie: gardener2Cookie })).status,
      403,
    )

    // Restore Gardener 2's approval, then close the request ('closed') -> Gardener 2 (no offer) still gets 403
    await pool.execute('UPDATE gardener_profiles SET is_approved = TRUE WHERE user_id = ?', [gardener2Id])
    await pool.execute("UPDATE inquiries SET status = 'closed' WHERE id = ?", [edgeInquiryId])
    assert.equal(
      (await apiRequest(`/api/request-images/${edgeImgId}`, { cookie: gardener2Cookie })).status,
      403,
    )
    // Owning client (Client A) still has 200 access on closed request
    assert.equal(
      (await apiRequest(`/api/request-images/${edgeImgId}`, { cookie: clientACookie, rawResponse: true })).status,
      200,
    )

    // 3. Deactivate Gardener 2's user account (is_active = FALSE) -> JWT cookie is immediately rejected with 401
    await pool.execute('UPDATE users SET is_active = FALSE WHERE id = ?', [gardener2Id])
    assert.equal(
      (await apiRequest(`/api/request-images/${edgeImgId}`, { cookie: gardener2Cookie })).status,
      401,
    )
    await pool.execute('UPDATE users SET is_active = TRUE WHERE id = ?', [gardener2Id])

    // 4. Delete the inquiry row directly (ON DELETE CASCADE removes request_images row in MySQL)
    await pool.execute('DELETE FROM inquiries WHERE id = ?', [edgeInquiryId])
    assert.equal(
      (await apiRequest(`/api/request-images/${edgeImgId}`, { cookie: clientACookie })).status,
      404,
    )
    assert.equal(
      (await apiRequest(`/api/request-images/inquiry/${edgeInquiryId}`, { cookie: clientACookie })).status,
      404,
    )

    // And cleanupOrphanedRequestImages sweeps the cascaded orphan file off disk
    await cleanupOrphanedRequestImages(24, { diskGraceMs: 0 })
    assert.equal(fs.existsSync(edgeAbsPath), false)
  })
})
