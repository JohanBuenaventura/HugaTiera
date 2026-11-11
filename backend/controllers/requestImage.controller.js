const fs = require('fs')
const fsp = require('fs/promises')
const path = require('path')
const { pool } = require('../config/database')
const {
  processAndSaveRequestImage,
  requestImageBaseDirectory,
  resolveRequestImagePath,
} = require('../middleware/upload.middleware')

const MAX_IMAGES_PER_INQUIRY = 5
const MAX_UNATTACHED_IMAGES_PER_USER = 10
const ORPHAN_MAX_AGE_HOURS = 24
const DEFAULT_DISK_ORPHAN_GRACE_MS = 10 * 60 * 1000
const DEFAULT_CLEANUP_INTERVAL_MS = 60 * 60 * 1000

let cleanupIntervalHandle = null

function parsePositiveInt(value) {
  const num = Number(value)
  return Number.isInteger(num) && num > 0 ? num : null
}

function serializeRequestImage(row) {
  return {
    id: row.id,
    inquiry_id: row.inquiry_id ?? null,
    uploaded_by: row.uploaded_by,
    kind: row.kind,
    parent_image_id: row.parent_image_id ?? null,
    mime_type: row.mime_type,
    file_size: row.file_size,
    ai_description: row.ai_description ?? null,
    created_at: row.created_at,
    url: `/api/request-images/${row.id}`,
  }
}

async function cleanupOrphanedRequestImages(maxAgeHours = ORPHAN_MAX_AGE_HOURS, options = {}) {
  const hours = Number.isInteger(maxAgeHours) && maxAgeHours > 0 ? maxAgeHours : ORPHAN_MAX_AGE_HOURS
  const diskGraceMs = typeof options.diskGraceMs === 'number' && options.diskGraceMs >= 0
    ? options.diskGraceMs
    : DEFAULT_DISK_ORPHAN_GRACE_MS
  const unlinkFn = typeof options.unlinkFn === 'function' ? options.unlinkFn : fsp.unlink

  // 1. Delete expired unattached DB rows FIRST (guarded by inquiry_id IS NULL),
  //    then unlink their files only if the DB row was actually removed.
  const [orphans] = await pool.execute(
    'SELECT id, file_path FROM request_images WHERE inquiry_id IS NULL AND created_at < DATE_SUB(NOW(), INTERVAL ? HOUR)',
    [hours],
  )
  let deletedCount = 0
  for (const orphan of orphans) {
    try {
      const [del] = await pool.execute(
        'DELETE FROM request_images WHERE id = ? AND inquiry_id IS NULL',
        [orphan.id],
      )
      if (del.affectedRows > 0) {
        deletedCount += 1
        const absPath = resolveRequestImagePath(orphan.file_path)
        await unlinkFn(absPath).catch((err) => {
          if (err && err.code !== 'ENOENT') {
            // File remains on disk temporarily and will be swept by step 2 below
          }
        })
      }
    } catch {
      // Ignore individual cleanup errors so user requests never fail due to background cleanup
    }
  }

  // 2. Sweep unreferenced files on disk (e.g., after ON DELETE CASCADE when an inquiry is deleted,
  //    or if a previous file unlink failed transiently).
  try {
    const [allRows] = await pool.execute('SELECT file_path FROM request_images')
    const activePaths = new Set(allRows.map((r) => r.file_path))
    const now = Date.now()

    for (const subfolder of ['originals', 'generated']) {
      const folderAbs = path.join(requestImageBaseDirectory, subfolder)
      let entries = []
      try {
        entries = await fsp.readdir(folderAbs)
      } catch {
        continue
      }
      for (const name of entries) {
        if (name === '.gitkeep') continue
        const relPath = path.posix.join(subfolder, name)
        if (activePaths.has(relPath)) continue
        try {
          const absPath = resolveRequestImagePath(relPath)
          const stat = await fsp.stat(absPath)
          if (now - stat.mtimeMs >= diskGraceMs) {
            await unlinkFn(absPath)
            deletedCount += 1
          }
        } catch {
          // Ignore individual file errors during disk sweep
        }
      }
    }
  } catch {
    // Ignore disk sweep errors if DB is temporarily unreachable
  }

  return deletedCount
}

function startOrphanCleanupSchedule(intervalMs = DEFAULT_CLEANUP_INTERVAL_MS, maxAgeHours = ORPHAN_MAX_AGE_HOURS) {
  if (cleanupIntervalHandle) return cleanupIntervalHandle
  // Run an initial non-blocking pass and schedule periodic sweeps
  cleanupOrphanedRequestImages(maxAgeHours).catch(() => {})
  cleanupIntervalHandle = setInterval(() => {
    cleanupOrphanedRequestImages(maxAgeHours).catch(() => {})
  }, intervalMs)
  if (typeof cleanupIntervalHandle.unref === 'function') {
    cleanupIntervalHandle.unref()
  }
  return cleanupIntervalHandle
}

function stopOrphanCleanupSchedule() {
  if (cleanupIntervalHandle) {
    clearInterval(cleanupIntervalHandle)
    cleanupIntervalHandle = null
  }
}

async function canUserViewRequestImage(user, imageRow) {
  if (!user || !imageRow) return false

  // 1. Administrator can view for platform moderation
  if (user.role === 'administrator') return true

  // 2. Owning client (uploader or inquiry owner)
  if (user.id === imageRow.uploaded_by) return true
  if (imageRow.inquiry_client_id && user.id === imageRow.inquiry_client_id) return true

  // 3. Unattached draft images are strictly private to the uploading client (and admin)
  if (!imageRow.inquiry_id) return false

  // 4. Only gardeners beyond this point can view attached request images
  if (user.role !== 'gardener') return false

  // 4a. Targeted provider on the inquiry (Case 2 direct inquiry, or selected provider)
  if (imageRow.inquiry_gardener_id && user.id === imageRow.inquiry_gardener_id) {
    return true
  }

  // 4b. Provider who has submitted an offer/quotation on this request
  const [offers] = await pool.execute(
    'SELECT id FROM quotations WHERE inquiry_id = ? AND gardener_id = ? LIMIT 1',
    [imageRow.inquiry_id, user.id],
  )
  if (offers.length > 0) return true

  // 4c. Approved provider viewing an open, non-expired Case 1 general request
  const isGeneralOpen = imageRow.request_type === 'general'
    && (imageRow.inquiry_status === 'open' || imageRow.inquiry_status === 'responded')
    && (!imageRow.inquiry_is_expired)

  if (isGeneralOpen) {
    const [profiles] = await pool.execute(
      'SELECT is_approved FROM gardener_profiles WHERE user_id = ? LIMIT 1',
      [user.id],
    )
    if (profiles[0] && Boolean(profiles[0].is_approved)) {
      return true
    }
  }

  return false
}

async function uploadRequestImage(req, res, next) {
  if (!req.file || !Buffer.isBuffer(req.file.buffer)) {
    return res.status(400).json({ message: 'A garden photo file is required.' })
  }

  const rawInquiryId = req.body?.inquiryId ?? req.body?.inquiry_id
  let inquiryId = null

  if (rawInquiryId !== undefined && rawInquiryId !== null && String(rawInquiryId).trim() !== '') {
    inquiryId = parsePositiveInt(rawInquiryId)
    if (!inquiryId) {
      return res.status(400).json({ message: 'A valid request ID is required when attaching a photo.' })
    }
  }

  try {
    // Opportunistically clean up abandoned draft uploads older than 24 hours
    await cleanupOrphanedRequestImages().catch(() => {})

    if (inquiryId) {
      const [inquiries] = await pool.execute(
        'SELECT id, client_id, status FROM inquiries WHERE id = ? LIMIT 1',
        [inquiryId],
      )
      const inquiry = inquiries[0]
      if (!inquiry || inquiry.client_id !== req.user.id) {
        return res.status(404).json({ message: 'Service request was not found or is not owned by you.' })
      }
      if (!['open', 'responded'].includes(inquiry.status)) {
        return res.status(400).json({
          message: 'Photos can only be added while the service request is open.',
        })
      }
      const [[countRow]] = await pool.execute(
        "SELECT COUNT(*) AS total FROM request_images WHERE inquiry_id = ? AND kind = 'original'",
        [inquiryId],
      )
      if (Number(countRow.total) >= MAX_IMAGES_PER_INQUIRY) {
        return res.status(400).json({
          message: `You can attach up to ${MAX_IMAGES_PER_INQUIRY} garden photos per request.`,
        })
      }
    } else {
      const [[draftCountRow]] = await pool.execute(
        'SELECT COUNT(*) AS total FROM request_images WHERE uploaded_by = ? AND inquiry_id IS NULL',
        [req.user.id],
      )
      if (Number(draftCountRow.total) >= MAX_UNATTACHED_IMAGES_PER_USER) {
        return res.status(400).json({
          message: `You have reached the limit of ${MAX_UNATTACHED_IMAGES_PER_USER} unsubmitted draft photos. Please submit or remove existing draft photos first.`,
        })
      }
    }

    let processed
    try {
      processed = await processAndSaveRequestImage(req.file.buffer, req.user.id, 'original')
    } catch (processingError) {
      if (processingError.statusCode === 400) {
        return res.status(400).json({ message: processingError.message })
      }
      throw processingError
    }

    try {
      const [result] = await pool.execute(
        `INSERT INTO request_images (inquiry_id, uploaded_by, kind, file_path, mime_type, file_size)
         VALUES (?, ?, 'original', ?, ?, ?)`,
        [inquiryId, req.user.id, processed.relativePath, processed.mimeType, processed.fileSize],
      )
      const [rows] = await pool.execute(
        `SELECT id, inquiry_id, uploaded_by, kind, parent_image_id, mime_type, file_size, ai_description, created_at
         FROM request_images WHERE id = ? LIMIT 1`,
        [result.insertId],
      )
      return res.status(201).json({
        image: serializeRequestImage(rows[0]),
      })
    } catch (dbError) {
      await fsp.unlink(processed.absolutePath).catch(() => {})
      throw dbError
    }
  } catch (error) {
    return next(error)
  }
}

async function getRequestImageFile(req, res, next) {
  const imageId = parsePositiveInt(req.params.imageId)
  if (!imageId) {
    return res.status(400).json({ message: 'A valid image ID is required.' })
  }

  try {
    const [rows] = await pool.execute(
      `SELECT
         ri.id,
         ri.inquiry_id,
         ri.uploaded_by,
         ri.kind,
         ri.file_path,
         ri.mime_type,
         ri.file_size,
         i.client_id AS inquiry_client_id,
         i.gardener_id AS inquiry_gardener_id,
         i.request_type,
         i.status AS inquiry_status,
         CASE WHEN i.expires_at IS NOT NULL AND i.expires_at <= NOW() THEN 1 ELSE 0 END AS inquiry_is_expired
       FROM request_images ri
       LEFT JOIN inquiries i ON i.id = ri.inquiry_id
       WHERE ri.id = ?
       LIMIT 1`,
      [imageId],
    )
    const imageRow = rows[0]
    if (!imageRow) {
      return res.status(404).json({ message: 'Garden photo was not found.' })
    }

    const allowed = await canUserViewRequestImage(req.user, imageRow)
    if (!allowed) {
      return res.status(403).json({ message: 'You do not have permission to view this garden photo.' })
    }

    let absolutePath
    try {
      absolutePath = resolveRequestImagePath(imageRow.file_path)
    } catch {
      return res.status(404).json({ message: 'Garden photo file was not found.' })
    }

    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({ message: 'Garden photo file was not found.' })
    }

    res.setHeader('Content-Type', imageRow.mime_type)
    res.setHeader('Cache-Control', 'private, no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    return res.sendFile(absolutePath, (error) => {
      if (error && !res.headersSent) next(error)
    })
  } catch (error) {
    return next(error)
  }
}

async function listInquiryImages(req, res, next) {
  const inquiryId = parsePositiveInt(req.params.inquiryId)
  if (!inquiryId) {
    return res.status(400).json({ message: 'A valid request ID is required.' })
  }

  try {
    const [inquiries] = await pool.execute(
      `SELECT
         id AS inquiry_id,
         client_id AS inquiry_client_id,
         gardener_id AS inquiry_gardener_id,
         request_type,
         status AS inquiry_status,
         CASE WHEN expires_at IS NOT NULL AND expires_at <= NOW() THEN 1 ELSE 0 END AS inquiry_is_expired
       FROM inquiries
       WHERE id = ?
       LIMIT 1`,
      [inquiryId],
    )
    const inquiry = inquiries[0]
    if (!inquiry) {
      return res.status(404).json({ message: 'Service request was not found.' })
    }

    const allowed = await canUserViewRequestImage(req.user, {
      ...inquiry,
      uploaded_by: inquiry.inquiry_client_id,
    })
    if (!allowed) {
      return res.status(403).json({ message: 'You do not have permission to view photos for this request.' })
    }

    const [rows] = await pool.execute(
      `SELECT id, inquiry_id, uploaded_by, kind, parent_image_id, mime_type, file_size, ai_description, created_at
       FROM request_images
       WHERE inquiry_id = ?
       ORDER BY created_at ASC, id ASC`,
      [inquiryId],
    )
    return res.json({
      images: rows.map(serializeRequestImage),
    })
  } catch (error) {
    return next(error)
  }
}

async function deleteRequestImage(req, res, next) {
  const imageId = parsePositiveInt(req.params.imageId)
  if (!imageId) {
    return res.status(400).json({ message: 'A valid image ID is required.' })
  }

  const connection = await pool.getConnection()
  let filePathToUnlink = null
  try {
    await connection.beginTransaction()
    const [rows] = await connection.execute(
      `SELECT
         ri.id,
         ri.inquiry_id,
         ri.uploaded_by,
         ri.file_path,
         i.status AS inquiry_status
       FROM request_images ri
       LEFT JOIN inquiries i ON i.id = ri.inquiry_id
       WHERE ri.id = ?
       LIMIT 1
       FOR UPDATE`,
      [imageId],
    )
    const imageRow = rows[0]
    if (!imageRow || imageRow.uploaded_by !== req.user.id) {
      await connection.rollback()
      return res.status(404).json({ message: 'Garden photo was not found or is not owned by you.' })
    }

    if (imageRow.inquiry_id && imageRow.inquiry_status !== 'open') {
      await connection.rollback()
      return res.status(400).json({
        message: 'Photos cannot be removed after providers have responded or an agreement is in progress.',
      })
    }

    const [delResult] = await connection.execute(
      'DELETE FROM request_images WHERE id = ? AND uploaded_by = ?',
      [imageId, req.user.id],
    )
    if (!delResult.affectedRows) {
      await connection.rollback()
      return res.status(404).json({ message: 'Garden photo was not found or is not owned by you.' })
    }

    filePathToUnlink = imageRow.file_path
    await connection.commit()
  } catch (error) {
    await connection.rollback().catch(() => {})
    return next(error)
  } finally {
    connection.release()
  }

  try {
    const absPath = resolveRequestImagePath(filePathToUnlink)
    await fsp.unlink(absPath).catch((err) => {
      if (err && err.code !== 'ENOENT') {
        // Any remaining file on disk will be cleaned up by cleanupOrphanedRequestImages disk sweep
      }
    })
  } catch {
    // Ignore path resolution error on delete
  }

  return res.status(204).send()
}

async function attachImagesToInquiry(connection, { inquiryId, clientId, imageIds }) {
  if (!Array.isArray(imageIds) || imageIds.length === 0) return []
  const uniqueIds = [...new Set(imageIds.map(parsePositiveInt).filter(Boolean))]
  if (uniqueIds.length === 0) return []
  if (uniqueIds.length > MAX_IMAGES_PER_INQUIRY) {
    const err = new Error(`You can attach up to ${MAX_IMAGES_PER_INQUIRY} garden photos per request.`)
    err.statusCode = 400
    throw err
  }

  const placeholders = uniqueIds.map(() => '?').join(', ')
  const [rows] = await connection.execute(
    `SELECT id, inquiry_id, uploaded_by
     FROM request_images
     WHERE id IN (${placeholders})
     FOR UPDATE`,
    uniqueIds,
  )

  if (rows.length !== uniqueIds.length) {
    const err = new Error('One or more uploaded garden photos were not found.')
    err.statusCode = 400
    throw err
  }

  for (const row of rows) {
    if (row.uploaded_by !== clientId) {
      const err = new Error('You can only attach garden photos that you uploaded.')
      err.statusCode = 403
      throw err
    }
    if (row.inquiry_id !== null && row.inquiry_id !== inquiryId) {
      const err = new Error('One or more garden photos are already attached to another request.')
      err.statusCode = 400
      throw err
    }
  }

  await connection.execute(
    `UPDATE request_images SET inquiry_id = ? WHERE id IN (${placeholders}) AND uploaded_by = ?`,
    [inquiryId, ...uniqueIds, clientId],
  )

  return uniqueIds
}

module.exports = {
  MAX_IMAGES_PER_INQUIRY,
  attachImagesToInquiry,
  canUserViewRequestImage,
  cleanupOrphanedRequestImages,
  deleteRequestImage,
  getRequestImageFile,
  listInquiryImages,
  serializeRequestImage,
  startOrphanCleanupSchedule,
  stopOrphanCleanupSchedule,
  uploadRequestImage,
}
