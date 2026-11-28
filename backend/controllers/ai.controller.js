const fsp = require('fs/promises')
const { pool } = require('../config/database')
const {
  processAndSaveRequestImage,
  resolveRequestImagePath,
} = require('../middleware/upload.middleware')
const { serializeRequestImage } = require('./requestImage.controller')
const {
  scoreOfferForClient,
  scoreOpenLeadForGardener,
  scoreServiceForClient,
} = require('../utils/smartMatching')
const {
  AI_SAFETY_DISCLAIMER,
  MAX_INPUT_LENGTH,
  executeWithModelFallback,
  getAiProvider,
  getFallbackModelName,
  getImageEditModelName,
  getModelName,
  getProviderFailureCode,
  isImageGenerationEnabled,
  streamWithModelFallback,
} = require('../services/ai.service')

const DEFAULT_HOURLY_LIMIT = 10
const DEFAULT_IMAGE_DAILY_LIMIT = 3

function getHourlyLimit() {
  const configured = Number(process.env.AI_HOURLY_LIMIT)
  return Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_HOURLY_LIMIT
}

function getImageDailyLimit() {
  const configured = Number(process.env.AI_IMAGE_DAILY_LIMIT)
  return Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_IMAGE_DAILY_LIMIT
}

function parsePositiveInt(value) {
  const num = Number(value)
  return Number.isInteger(num) && num > 0 ? num : null
}

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

async function getHourlyUsageCount(userId, executor = pool) {
  const [[row]] = await executor.execute(
    `SELECT COUNT(*) AS used
     FROM ai_usage_log
     WHERE user_id = ?
       AND feature <> 'image_generation'
       AND outcome IN ('success', 'error')
       AND created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)`,
    [userId],
  )
  return Number(row?.used || 0)
}

async function getDailyImageUsageCount(userId, executor = pool) {
  const [[row]] = await executor.execute(
    `SELECT COUNT(*) AS used
     FROM ai_usage_log
     WHERE user_id = ?
       AND feature = 'image_generation'
       AND outcome IN ('success', 'error')
       AND (error_code IS NULL OR error_code <> 'OFF_TOPIC_EDIT')
       AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)`,
    [userId],
  )
  return Number(row?.used || 0)
}

async function reserveImageUsageSlot({
  userId,
  inquiryId = null,
  requestImageId = null,
  model = null,
}) {
  const limit = getImageDailyLimit()
  const resolvedModel = (model || getImageEditModelName()).slice(0, 100)
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    await conn.execute('SELECT id FROM users WHERE id = ? FOR UPDATE', [userId])

    const used = await getDailyImageUsageCount(userId, conn)
    if (used >= limit) {
      await conn.execute(
        `INSERT INTO ai_usage_log
          (user_id, feature, inquiry_id, request_image_id, model, outcome, error_code)
         VALUES (?, 'image_generation', ?, ?, ?, 'rate_limited', 'IMAGE_DAILY_LIMIT_EXCEEDED')`,
        [userId, inquiryId, requestImageId, resolvedModel],
      )
      await conn.commit()
      return { allowed: false, usageId: null, used, limit }
    }

    const [insertRes] = await conn.execute(
      `INSERT INTO ai_usage_log
        (user_id, feature, inquiry_id, request_image_id, model, outcome, error_code)
       VALUES (?, 'image_generation', ?, ?, ?, 'error', 'RESERVED_IN_FLIGHT')`,
      [userId, inquiryId, requestImageId, resolvedModel],
    )
    await conn.commit()
    return {
      allowed: true,
      usageId: insertRes.insertId,
      used: used + 1,
      limit,
    }
  } catch (err) {
    await conn.rollback().catch(() => {})
    throw err
  } finally {
    conn.release()
  }
}

async function reserveAiUsageSlot({
  userId,
  feature,
  inquiryId = null,
  requestImageId = null,
  model = null,
}) {
  const limit = getHourlyLimit()
  const resolvedModel = (model || getModelName() || 'gemini-3.8-flash').slice(0, 100)
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    // Lock the user row to strictly serialize concurrent AI usage reservations per user
    await conn.execute('SELECT id FROM users WHERE id = ? FOR UPDATE', [userId])

    const used = await getHourlyUsageCount(userId, conn)
    if (used >= limit) {
      await conn.execute(
        `INSERT INTO ai_usage_log
          (user_id, feature, inquiry_id, request_image_id, model, outcome, error_code)
         VALUES (?, ?, ?, ?, ?, 'rate_limited', 'RATE_LIMIT_EXCEEDED')`,
        [userId, feature, inquiryId, requestImageId, resolvedModel],
      )
      await conn.commit()
      return { allowed: false, usageId: null, used, limit }
    }

    // Reserve the slot immediately as outcome = 'error', error_code = 'RESERVED_IN_FLIGHT'
    // so concurrent requests count it and interrupted/crashed requests never leave uncounted usage.
    const [insertRes] = await conn.execute(
      `INSERT INTO ai_usage_log
        (user_id, feature, inquiry_id, request_image_id, model, outcome, error_code)
       VALUES (?, ?, ?, ?, ?, 'error', 'RESERVED_IN_FLIGHT')`,
      [userId, feature, inquiryId, requestImageId, resolvedModel],
    )
    await conn.commit()
    return {
      allowed: true,
      usageId: insertRes.insertId,
      used: used + 1,
      limit,
    }
  } catch (err) {
    await conn.rollback().catch(() => {})
    throw err
  } finally {
    conn.release()
  }
}

async function finalizeAiUsageSlot(usageId, { outcome, errorCode = null, model = null }) {
  if (!usageId) return
  const resolvedErrorCode = outcome === 'success'
    ? (errorCode ? String(errorCode).slice(0, 50) : null)
    : (errorCode ? String(errorCode).slice(0, 50) : 'INTERNAL_ERROR')
  const resolvedModel = model ? String(model).slice(0, 100) : null
  await pool.execute(
    `UPDATE ai_usage_log
     SET outcome = ?,
         error_code = ?,
         model = COALESCE(?, model)
     WHERE id = ?`,
    [outcome, resolvedErrorCode, resolvedModel, usageId],
  )
}

function classifyAiError(error) {
  if (!error) return { status: 500, code: 'UNKNOWN_ERROR', message: 'An unexpected AI error occurred.' }
  if (error.code === 'IMAGE_GENERATION_POSTPONED' || error.statusCode === 501) {
    return {
      status: 501,
      code: 'IMAGE_GENERATION_POSTPONED',
      message: error.message,
    }
  }
  if (error.code === 'OFF_TOPIC_EDIT') {
    return {
      status: 400,
      code: 'OFF_TOPIC_EDIT',
      message: error.message,
    }
  }
  if (error.code === 'CF_NOT_CONFIGURED') {
    return {
      status: 503,
      code: 'CF_NOT_CONFIGURED',
      message: 'Cloudflare Workers AI photo editing is enabled, but CF_ACCOUNT_ID or CF_API_TOKEN is missing in backend/.env.',
    }
  }
  if (error.message === 'GEMINI_API_KEY is not configured.') {
    return {
      status: 503,
      code: 'NO_API_KEY',
      message: 'The Garden Planning Assistant is not configured. Add GEMINI_API_KEY to backend/.env and restart the backend.',
    }
  }
  if (error.name === 'AbortError' || error.code === 'ABORT_ERR' || error.code === 'ETIMEDOUT') {
    return {
      status: 504,
      code: 'TIMEOUT',
      message: 'The AI provider took too long to respond. Please try again.',
    }
  }
  if ([400, 401, 403].includes(error.providerStatus)) {
    return {
      status: 502,
      code: `PROVIDER_${error.providerStatus}`,
      message: 'The AI provider rejected the configured credentials or request parameters.',
    }
  }
  if (error.providerStatus === 429) {
    return {
      status: 503,
      code: 'PROVIDER_429',
      message: 'The AI provider rate limit or quota was reached. Please try again later.',
    }
  }
  if ([500, 502, 503, 504].includes(error.providerStatus)) {
    return {
      status: 503,
      code: `PROVIDER_${error.providerStatus}`,
      message: 'The AI provider is temporarily busy. Please try again later.',
    }
  }
  if (error.providerStatus === 404) {
    return {
      status: 503,
      code: 'MODEL_UNAVAILABLE',
      message: 'The configured AI model is unavailable. Set GEMINI_MODEL to an available Gemini model and restart the backend.',
    }
  }
  if (getProviderFailureCode(error) === 'NETWORK_ERROR') {
    return {
      status: 503,
      code: 'NETWORK_ERROR',
      message: 'The AI provider could not be reached. Please try again later.',
    }
  }
  return null
}

function buildFailureAuditMetadata(error, defaultModel, classified) {
  if (error?.fallbackAttempted === true) {
    const primaryCode = error.primaryErrorCode || getProviderFailureCode(error.primaryError)
    const fallbackCode = error.fallbackErrorCode || (classified ? classified.code : getProviderFailureCode(error))
    return {
      model: `${error.primaryModel}->${error.fallbackModel}`.slice(0, 100),
      errorCode: `FALLBACK_FAILED:${primaryCode}->${fallbackCode}`.slice(0, 50),
    }
  }
  return {
    model: (error?.primaryModel || defaultModel || 'gemini-3.8-flash').slice(0, 100),
    errorCode: (classified ? classified.code : 'INTERNAL_ERROR').slice(0, 50),
  }
}

async function getAiUsageStatus(req, res, next) {
  try {
    const limit = getHourlyLimit()
    const used = await getHourlyUsageCount(req.user.id)
    const imageLimit = getImageDailyLimit()
    const imageUsed = await getDailyImageUsageCount(req.user.id)
    const imageGenerationEnabled = isImageGenerationEnabled()
    const provider = getAiProvider()
    const primaryModel = typeof provider.getModel === 'function' ? provider.getModel() : getModelName()
    const fallbackModel = typeof provider.getFallbackModel === 'function'
      ? provider.getFallbackModel(primaryModel)
      : getFallbackModelName(primaryModel)
    return res.json({
      provider: provider.name || 'gemini',
      model: primaryModel,
      primaryModel,
      fallbackModel: fallbackModel || null,
      fallbackEnabled: Boolean(fallbackModel),
      used,
      limit,
      remaining: Math.max(0, limit - used),
      imageGenerationEnabled,
      imageModel: getImageEditModelName(),
      imageQuota: {
        used: imageUsed,
        limit: imageLimit,
        remaining: Math.max(0, imageLimit - imageUsed),
        windowHours: 24,
      },
    })
  } catch (error) {
    return next(error)
  }
}

async function createGardenPlan(req, res, next) {
  const input = text(req.body?.input)
  if (!input || input.length > MAX_INPUT_LENGTH) {
    return res.status(400).json({ message: `Please provide a request between 1 and ${MAX_INPUT_LENGTH} characters.` })
  }

  const provider = getAiProvider()
  const primaryModel = typeof provider.getModel === 'function' ? provider.getModel() : getModelName()
  let reservedUsageId = null

  try {
    const rateCheck = await reserveAiUsageSlot({
      userId: req.user.id,
      feature: 'garden_plan',
      model: primaryModel,
    })
    if (!rateCheck.allowed) {
      return res.status(429).json({
        message: `Assistant usage is limited to ${rateCheck.limit} requests per hour. Please try again later.`,
      })
    }
    reservedUsageId = rateCheck.usageId

    const execution = await executeWithModelFallback('generateGardenPlan', input)
    await finalizeAiUsageSlot(reservedUsageId, {
      outcome: 'success',
      errorCode: execution.fallbackUsed ? `FALLBACK_FROM_${execution.primaryErrorCode}` : null,
      model: execution.model,
    })

    return res.json({
      answer: execution.result,
      model: execution.model,
      fallbackUsed: execution.fallbackUsed,
      disclaimer: 'AI suggestions are informational and may require verification from a qualified local gardening professional.',
    })
  } catch (error) {
    const classified = classifyAiError(error)
    const auditMeta = buildFailureAuditMetadata(error, primaryModel, classified)
    await finalizeAiUsageSlot(reservedUsageId, {
      outcome: 'error',
      errorCode: auditMeta.errorCode,
      model: auditMeta.model,
    }).catch(() => {})

    if (classified) {
      return res.status(classified.status).json({ message: classified.message })
    }
    return next(error)
  }
}

async function streamGardenPlan(req, res) {
  const input = text(req.body?.input)
  if (!input || input.length > MAX_INPUT_LENGTH) {
    return res.status(400).json({ message: `Please provide a request between 1 and ${MAX_INPUT_LENGTH} characters.` })
  }

  const provider = getAiProvider()
  const primaryModel = typeof provider.getModel === 'function' ? provider.getModel() : getModelName()
  let reservedUsageId = null

  try {
    const rateCheck = await reserveAiUsageSlot({
      userId: req.user.id,
      feature: 'garden_plan',
      model: primaryModel,
    })
    if (!rateCheck.allowed) {
      return res.status(429).json({
        message: `Assistant usage is limited to ${rateCheck.limit} requests per hour. Please try again later.`,
      })
    }
    reservedUsageId = rateCheck.usageId
  } catch (rateErr) {
    return res.status(500).json({ message: rateErr?.message || 'Unable to check AI usage quota right now.' })
  }

  const abortController = new AbortController()
  let clientClosed = false
  req.on('close', () => {
    clientClosed = true
    abortController.abort()
  })

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders()
  }

  const sendEvent = (payload) => {
    if (clientClosed || res.writableEnded) return
    res.write(`data: ${JSON.stringify(payload)}\n\n`)
  }

  try {
    const execution = await streamWithModelFallback('streamGardenPlan', input, {
      signal: abortController.signal,
      onChunk: (piece) => sendEvent({ type: 'chunk', text: piece }),
    })

    await finalizeAiUsageSlot(reservedUsageId, {
      outcome: 'success',
      errorCode: execution.fallbackUsed ? `FALLBACK_FROM_${execution.primaryErrorCode}` : null,
      model: execution.model,
    })

    sendEvent({
      type: 'done',
      answer: execution.result,
      model: execution.model,
      fallbackUsed: execution.fallbackUsed,
      disclaimer: 'AI suggestions are informational and may require verification from a qualified local gardening professional.',
    })
    return res.end()
  } catch (error) {
    const classified = classifyAiError(error)
    const auditMeta = buildFailureAuditMetadata(error, primaryModel, classified)
    await finalizeAiUsageSlot(reservedUsageId, {
      outcome: 'error',
      errorCode: auditMeta.errorCode,
      model: auditMeta.model,
    }).catch(() => {})

    sendEvent({
      type: 'error',
      message: classified?.message || 'The Garden Planning Assistant could not complete your request.',
    })
    return res.end()
  }
}

async function createRequirementAssistance(req, res, next) {
  const subject = text(req.body?.subject)
  const description = text(req.body?.description)
  const location = text(req.body?.location)
  const rawInquiryId = req.body?.inquiryId ?? req.body?.inquiry_id
  const rawImageIds = req.body?.imageIds ?? req.body?.requestImageIds ?? req.body?.request_image_ids ?? []

  if (!description || description.length > MAX_INPUT_LENGTH) {
    return res.status(400).json({
      message: `Please provide a project description between 1 and ${MAX_INPUT_LENGTH} characters.`,
    })
  }
  if (subject.length > 200) {
    return res.status(400).json({ message: 'Subject must be 200 characters or fewer.' })
  }
  if (location.length > 255) {
    return res.status(400).json({ message: 'Location must be 255 characters or fewer.' })
  }
  if (!Array.isArray(rawImageIds) || rawImageIds.length > 5) {
    return res.status(400).json({ message: 'You can include up to 5 uploaded garden photos.' })
  }

  let inquiryId = null
  if (rawInquiryId !== undefined && rawInquiryId !== null && String(rawInquiryId).trim() !== '') {
    inquiryId = parsePositiveInt(rawInquiryId)
    if (!inquiryId) {
      return res.status(400).json({ message: 'A valid inquiry ID is required.' })
    }
  }

  const parsedImageIds = rawImageIds.map(parsePositiveInt)
  if (parsedImageIds.some((id) => !id)) {
    return res.status(400).json({ message: 'All imageIds must be valid positive integers.' })
  }
  const uniqueImageIds = [...new Set(parsedImageIds)]

  const provider = getAiProvider()
  const primaryModel = typeof provider.getModel === 'function' ? provider.getModel() : getModelName()
  let reservedUsageId = null

  try {
    if (inquiryId) {
      const [inquiries] = await pool.execute(
        'SELECT id, client_id FROM inquiries WHERE id = ? LIMIT 1',
        [inquiryId],
      )
      if (!inquiries[0]) {
        return res.status(404).json({ message: 'Inquiry was not found.' })
      }
      if (inquiries[0].client_id !== req.user.id && req.user.role !== 'administrator') {
        return res.status(403).json({ message: 'You can only request AI assistance for your own inquiry.' })
      }
    }

    const photoDescriptions = []
    if (uniqueImageIds.length > 0) {
      const placeholders = uniqueImageIds.map(() => '?').join(', ')
      const [imageRows] = await pool.execute(
        `SELECT id, uploaded_by, ai_description
         FROM request_images
         WHERE id IN (${placeholders})`,
        uniqueImageIds,
      )
      if (imageRows.length !== uniqueImageIds.length) {
        return res.status(404).json({ message: 'One or more uploaded garden photos were not found.' })
      }
      for (const img of imageRows) {
        if (img.uploaded_by !== req.user.id && req.user.role !== 'administrator') {
          return res.status(403).json({ message: 'You can only reference garden photos that you uploaded.' })
        }
        if (img.ai_description) {
          photoDescriptions.push(img.ai_description)
        }
      }
    }

    const rateCheck = await reserveAiUsageSlot({
      userId: req.user.id,
      feature: 'requirements',
      inquiryId,
      requestImageId: uniqueImageIds[0] || null,
      model: primaryModel,
    })
    if (!rateCheck.allowed) {
      return res.status(429).json({
        message: `Assistant usage is limited to ${rateCheck.limit} requests per hour. Please try again later.`,
      })
    }
    reservedUsageId = rateCheck.usageId

    const [categories] = await pool.execute(
      'SELECT id, name, description FROM service_categories WHERE is_active = TRUE ORDER BY name ASC',
    )
    const [addons] = await pool.execute(
      'SELECT id, name, item_type, unit, unit_price_min, unit_price_max FROM pricing_addons WHERE is_active = TRUE ORDER BY id ASC',
    )

    const rawArea = Number(req.body?.areaSqm ?? req.body?.area_sqm)
    const areaSqm = Number.isFinite(rawArea) && rawArea > 0 ? rawArea : null

    const execution = await executeWithModelFallback('generateRequirementAssistance', {
      subject,
      description,
      location,
      areaSqm,
      categories,
      addons,
      photoDescriptions,
    })

    await finalizeAiUsageSlot(reservedUsageId, {
      outcome: 'success',
      errorCode: execution.fallbackUsed ? `FALLBACK_FROM_${execution.primaryErrorCode}` : null,
      model: execution.model,
    })

    return res.json({
      suggestion: execution.result,
      model: execution.model,
      fallbackUsed: execution.fallbackUsed,
      disclaimer: AI_SAFETY_DISCLAIMER,
    })
  } catch (error) {
    const classified = classifyAiError(error)
    const auditMeta = buildFailureAuditMetadata(error, primaryModel, classified)
    await finalizeAiUsageSlot(reservedUsageId, {
      outcome: 'error',
      errorCode: auditMeta.errorCode,
      model: auditMeta.model,
    }).catch(() => {})

    if (classified) {
      return res.status(classified.status).json({ message: classified.message })
    }
    return next(error)
  }
}

async function analyzeUploadedPhoto(req, res, next) {
  const imageId = parsePositiveInt(req.body?.imageId ?? req.body?.requestImageId ?? req.body?.request_image_id)
  if (!imageId) {
    return res.status(400).json({ message: 'A valid garden photo ID (imageId) is required.' })
  }
  const notes = text(req.body?.notes)
  if (notes.length > 1000) {
    return res.status(400).json({ message: 'Photo notes must be 1,000 characters or fewer.' })
  }

  const provider = getAiProvider()
  const primaryModel = typeof provider.getModel === 'function' ? provider.getModel() : getModelName()
  let reservedUsageId = null

  try {
    const [rows] = await pool.execute(
      `SELECT ri.id, ri.inquiry_id, ri.uploaded_by, ri.kind, ri.file_path, ri.mime_type,
              i.status AS inquiry_status
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
    if (imageRow.uploaded_by !== req.user.id && req.user.role !== 'administrator') {
      return res.status(403).json({ message: 'You can only analyze garden photos that you uploaded.' })
    }
    if (imageRow.inquiry_id && !['open', 'responded'].includes(imageRow.inquiry_status)) {
      return res.status(409).json({
        message: 'Photos can only be analyzed while the service request is open.',
      })
    }

    let absPath
    let imageBuffer
    try {
      absPath = resolveRequestImagePath(imageRow.file_path)
      imageBuffer = await fsp.readFile(absPath)
    } catch {
      return res.status(404).json({ message: 'Garden photo file was not found on disk.' })
    }

    const rateCheck = await reserveAiUsageSlot({
      userId: req.user.id,
      feature: 'photo_analysis',
      inquiryId: imageRow.inquiry_id || null,
      requestImageId: imageRow.id,
      model: primaryModel,
    })
    if (!rateCheck.allowed) {
      return res.status(429).json({
        message: `Assistant usage is limited to ${rateCheck.limit} requests per hour. Please try again later.`,
      })
    }
    reservedUsageId = rateCheck.usageId

    const execution = await executeWithModelFallback('analyzeGardenPhoto', {
      imageBuffer,
      mimeType: imageRow.mime_type,
      clientNotes: notes,
    })
    const aiDescription = execution.result

    await pool.execute(
      'UPDATE request_images SET ai_description = ? WHERE id = ?',
      [aiDescription, imageRow.id],
    )

    await finalizeAiUsageSlot(reservedUsageId, {
      outcome: 'success',
      errorCode: execution.fallbackUsed ? `FALLBACK_FROM_${execution.primaryErrorCode}` : null,
      model: execution.model,
    })

    const [updatedRows] = await pool.execute(
      `SELECT id, inquiry_id, uploaded_by, kind, parent_image_id, mime_type, file_size, ai_description, created_at
       FROM request_images WHERE id = ? LIMIT 1`,
      [imageRow.id],
    )

    return res.json({
      image: serializeRequestImage(updatedRows[0]),
      aiDescription,
      model: execution.model,
      fallbackUsed: execution.fallbackUsed,
      disclaimer: AI_SAFETY_DISCLAIMER,
    })
  } catch (error) {
    const classified = classifyAiError(error)
    const auditMeta = buildFailureAuditMetadata(error, primaryModel, classified)
    await finalizeAiUsageSlot(reservedUsageId, {
      outcome: 'error',
      errorCode: auditMeta.errorCode,
      model: auditMeta.model,
    }).catch(() => {})

    if (classified) {
      return res.status(classified.status).json({ message: classified.message })
    }
    return next(error)
  }
}

function parseBoolQuery(value) {
  return value === true || value === 'true' || value === '1'
}

async function getSmartRecommendations(req, res, next) {
  const mode = text(req.query.mode).toLowerCase() || (req.user.role === 'gardener' ? 'leads' : 'services')
  const sortBy = text(req.query.sortBy || req.query.sort).toLowerCase() || 'smart_ai'
  const nearbyOnly = parseBoolQuery(req.query.nearbyOnly)
  const goodConductOnly = parseBoolQuery(req.query.goodConductOnly)
  const minRating = req.query.minRating !== undefined && req.query.minRating !== '' ? Number(req.query.minRating) : 0
  const keyword = text(req.query.keyword || req.query.q)
  const categoryId = parsePositiveInt(req.query.categoryId)
  const limit = Math.min(Math.max(Number(req.query.limit) || 12, 1), 30)

  try {
    if (mode === 'services') {
      let userLocation = text(req.query.location)
      if (!userLocation && req.user.role === 'client') {
        const [cp] = await pool.execute(
          'SELECT address, city FROM client_profiles WHERE user_id = ? LIMIT 1',
          [req.user.id],
        )
        if (cp[0]) {
          userLocation = [cp[0].address, cp[0].city].filter(Boolean).join(', ')
        }
      }
      if (!userLocation) userLocation = 'Zamboanga City'

      const [rows] = await pool.execute(
        `SELECT s.id, s.title, s.description, s.indicative_price, s.price_unit,
                s.service_area, s.image_path, s.category_id, c.name AS category_name,
                s.gardener_id, u.first_name, u.last_name, u.avatar_path AS gardener_avatar_path,
                gp.business_name, gp.service_area AS gardener_service_area, gp.years_of_experience,
                (SELECT ROUND(AVG(r.rating), 1) FROM reviews r WHERE r.gardener_id = s.gardener_id AND r.is_visible = TRUE) AS average_rating,
                (SELECT COUNT(*) FROM reviews r WHERE r.gardener_id = s.gardener_id AND r.is_visible = TRUE) AS review_count,
                (SELECT COUNT(*) FROM bookings b WHERE b.gardener_id = s.gardener_id AND b.status = 'completed') AS completed_jobs,
                (SELECT COUNT(*) FROM bookings b WHERE b.gardener_id = s.gardener_id AND b.status = 'completed' AND b.transaction_status = 'closed') AS closed_jobs,
                (SELECT COUNT(*) FROM bookings b WHERE b.gardener_id = s.gardener_id) AS total_bookings,
                (SELECT COUNT(*) FROM bookings b WHERE b.gardener_id = s.gardener_id AND b.status = 'cancelled' AND b.cancelled_by = s.gardener_id AND (b.cancellation_reason_type IS NULL OR b.cancellation_reason_type NOT IN ('typhoon_weather', 'accident_emergency'))) AS avoidable_cancellations,
                (SELECT COUNT(*) FROM reports rep WHERE rep.reported_user_id = s.gardener_id AND rep.status = 'resolved') AS substantiated_reports
         FROM services s
         JOIN users u ON u.id = s.gardener_id
         JOIN gardener_profiles gp ON gp.user_id = u.id
         JOIN service_categories c ON c.id = s.category_id
         WHERE s.is_active = TRUE AND u.is_active = TRUE AND gp.is_approved = TRUE AND c.is_active = TRUE`,
      )

      let scored = rows.map((service) => scoreServiceForClient({
        service,
        clientLocation: userLocation,
        queryText: keyword,
        sortBy,
      }))

      if (nearbyOnly) {
        scored = scored.filter((item) => item.ai_match.proximity.isNearby)
      }
      if (Number.isFinite(minRating) && minRating > 0) {
        scored = scored.filter((item) => item.average_rating != null && Number(item.average_rating) >= minRating)
      }
      if (goodConductOnly) {
        scored = scored.filter((item) => item.ai_match.conduct.cleanConduct)
      }
      if (categoryId) {
        scored = scored.filter((item) => Number(item.category_id) === categoryId)
      }
      if (keyword) {
        const kwMatched = scored.filter((item) => item.ai_match.keywordScore > 0)
        if (kwMatched.length > 0) scored = kwMatched
      }

      scored.sort((a, b) => {
        if (b.ai_match.matchScore !== a.ai_match.matchScore) {
          return b.ai_match.matchScore - a.ai_match.matchScore
        }
        return (Number(b.average_rating) || 0) - (Number(a.average_rating) || 0)
      })

      return res.json({
        mode: 'services',
        referenceLocation: userLocation,
        sortBy,
        filters: { nearbyOnly, goodConductOnly, minRating: minRating || 0, keyword, categoryId: categoryId || null },
        totalCandidates: rows.length,
        recommendations: scored.slice(0, limit),
        disclaimer: AI_SAFETY_DISCLAIMER,
      })
    }

    if (mode === 'offers') {
      const inquiryId = parsePositiveInt(req.query.inquiryId)
      if (!inquiryId) {
        return res.status(400).json({ message: 'A valid inquiryId is required to rank offers.' })
      }
      const [inqRows] = await pool.execute(
        `SELECT id, client_id, location, estimated_min_amount, estimated_max_amount, subject
         FROM inquiries WHERE id = ? LIMIT 1`,
        [inquiryId],
      )
      const inquiry = inqRows[0]
      if (!inquiry) return res.status(404).json({ message: 'Inquiry was not found.' })
      if (req.user.role !== 'administrator' && inquiry.client_id !== req.user.id) {
        return res.status(403).json({ message: 'Only the client who submitted this inquiry can filter its offers.' })
      }

      const [offerRows] = await pool.execute(
        `SELECT q.id, q.inquiry_id, q.gardener_id, q.revision_number, q.response_type,
                q.amount, q.labor_amount, q.materials_amount, q.details, q.estimated_working_days,
                q.requires_site_visit, q.availability_start, q.availability_end, q.valid_until,
                q.status, q.created_at,
                CONCAT(u.first_name, ' ', u.last_name) AS gardener_name,
                gp.business_name, gp.service_area AS gardener_service_area, gp.years_of_experience,
                (SELECT ROUND(AVG(r.rating), 1) FROM reviews r WHERE r.gardener_id = q.gardener_id AND r.is_visible = TRUE) AS average_rating,
                (SELECT COUNT(*) FROM reviews r WHERE r.gardener_id = q.gardener_id AND r.is_visible = TRUE) AS review_count,
                (SELECT COUNT(*) FROM bookings b WHERE b.gardener_id = q.gardener_id AND b.status = 'completed') AS completed_jobs,
                (SELECT COUNT(*) FROM bookings b WHERE b.gardener_id = q.gardener_id AND b.status = 'completed' AND b.transaction_status = 'closed') AS closed_jobs,
                (SELECT COUNT(*) FROM bookings b WHERE b.gardener_id = q.gardener_id) AS total_bookings,
                (SELECT COUNT(*) FROM bookings b WHERE b.gardener_id = q.gardener_id AND b.status = 'cancelled' AND b.cancelled_by = q.gardener_id AND (b.cancellation_reason_type IS NULL OR b.cancellation_reason_type NOT IN ('typhoon_weather', 'accident_emergency'))) AS avoidable_cancellations,
                (SELECT COUNT(*) FROM reports rep WHERE rep.reported_user_id = q.gardener_id AND rep.status = 'resolved') AS substantiated_reports
         FROM quotations q
         JOIN users u ON u.id = q.gardener_id
         LEFT JOIN gardener_profiles gp ON gp.user_id = q.gardener_id
         WHERE q.inquiry_id = ? AND q.status IN ('sent', 'accepted')`,
        [inquiryId],
      )

      const refLocation = text(req.query.location) || inquiry.location || 'Zamboanga City'
      let scored = offerRows.map((offer) => scoreOfferForClient({
        offer,
        inquiryLocation: refLocation,
        estimatedMin: inquiry.estimated_min_amount,
        estimatedMax: inquiry.estimated_max_amount,
        sortBy,
      }))

      if (nearbyOnly) {
        scored = scored.filter((item) => item.ai_match.proximity.isNearby)
      }
      if (Number.isFinite(minRating) && minRating > 0) {
        scored = scored.filter((item) => item.average_rating != null && Number(item.average_rating) >= minRating)
      }
      if (goodConductOnly) {
        scored = scored.filter((item) => item.ai_match.conduct.cleanConduct)
      }

      scored.sort((a, b) => {
        if (sortBy === 'lowest_price') {
          const pa = a.amount != null ? Number(a.amount) : Number.POSITIVE_INFINITY
          const pb = b.amount != null ? Number(b.amount) : Number.POSITIVE_INFINITY
          if (pa !== pb) return pa - pb
        }
        return b.ai_match.matchScore - a.ai_match.matchScore
      })

      return res.json({
        mode: 'offers',
        inquiryId,
        referenceLocation: refLocation,
        sortBy,
        totalCandidates: offerRows.length,
        recommendations: scored,
        disclaimer: AI_SAFETY_DISCLAIMER,
      })
    }

    if (mode === 'leads') {
      if (req.user.role !== 'gardener' && req.user.role !== 'administrator') {
        return res.status(403).json({ message: 'Only approved gardeners can filter open client service leads.' })
      }
      let gardenerArea = text(req.query.location)
      let gardenerCategoryIds = []
      if (req.user.role === 'gardener') {
        const [gpRows] = await pool.execute(
          'SELECT is_approved, service_area FROM gardener_profiles WHERE user_id = ? LIMIT 1',
          [req.user.id],
        )
        if (!gpRows[0] || !gpRows[0].is_approved) {
          return res.status(403).json({ message: 'Your gardener profile must be approved before viewing open client leads.' })
        }
        if (!gardenerArea) gardenerArea = gpRows[0].service_area || 'Zamboanga City'
        const [catRows] = await pool.execute(
          'SELECT DISTINCT category_id FROM services WHERE gardener_id = ? AND is_active = TRUE',
          [req.user.id],
        )
        gardenerCategoryIds = catRows.map((c) => Number(c.category_id))
      }
      if (!gardenerArea) gardenerArea = 'Zamboanga City'

      const [leadRows] = await pool.execute(
        `SELECT i.id, i.request_type, i.category_id, i.subject, i.description, i.ai_summary,
                i.requested_date, i.location, i.area_sqm, i.work_complexity, i.materials_option,
                i.site_visit_requested, i.estimated_min_amount, i.estimated_max_amount, i.category_specs,
                i.status, i.expires_at, i.created_at,
                sc.name AS category_name,
                u.first_name AS client_first_name,
                (SELECT COUNT(*) FROM quotations q WHERE q.inquiry_id = i.id AND q.status IN ('sent', 'accepted')) AS offer_count,
                (SELECT COUNT(*) FROM bookings b WHERE b.client_id = i.client_id AND b.status = 'completed' AND b.transaction_status = 'closed') AS client_closed_jobs,
                (SELECT COUNT(*) FROM reports rep WHERE rep.reported_user_id = i.client_id AND rep.status = 'resolved') AS client_substantiated_reports,
                my_q.id AS my_quotation_id,
                my_q.status AS my_quotation_status,
                my_q.amount AS my_quotation_amount
         FROM inquiries i
         LEFT JOIN service_categories sc ON sc.id = i.category_id
         JOIN users u ON u.id = i.client_id AND u.is_active = TRUE
         LEFT JOIN quotations my_q ON my_q.id = (
           SELECT q2.id FROM quotations q2
           WHERE q2.inquiry_id = i.id AND q2.gardener_id = ?
           ORDER BY q2.created_at DESC, q2.id DESC
           LIMIT 1
         )
         WHERE i.request_type = 'general'
           AND i.status IN ('open', 'responded')
           AND (i.expires_at IS NULL OR i.expires_at > NOW())
           AND i.client_id <> ?`,
        [req.user.id, req.user.id],
      )

      if (leadRows.length > 0) {
        const ids = leadRows.map((r) => r.id)
        const [imgRows] = await pool.execute(
          `SELECT id, inquiry_id, uploaded_by, kind, parent_image_id, mime_type, file_size, ai_description, created_at
           FROM request_images WHERE inquiry_id IN (${ids.map(() => '?').join(', ')})
           ORDER BY created_at ASC, id ASC`,
          ids,
        )
        const imgMap = new Map()
        for (const img of imgRows) {
          if (!imgMap.has(img.inquiry_id)) imgMap.set(img.inquiry_id, [])
          imgMap.get(img.inquiry_id).push(serializeRequestImage(img))
        }
        for (const row of leadRows) {
          row.images = imgMap.get(row.id) || []
          if (typeof row.category_specs === 'string') {
            try { row.category_specs = JSON.parse(row.category_specs) } catch { row.category_specs = null }
          }
        }
      }

      let scored = leadRows.map((lead) => scoreOpenLeadForGardener({
        lead,
        gardenerArea,
        gardenerCategoryIds,
        queryText: keyword,
        sortBy,
      }))

      if (nearbyOnly) {
        scored = scored.filter((item) => item.ai_match.proximity.isNearby)
      }
      if (goodConductOnly) {
        scored = scored.filter((item) => item.ai_match.clientCleanConduct)
      }
      if (categoryId) {
        scored = scored.filter((item) => Number(item.category_id) === categoryId)
      }
      if (keyword) {
        const q = keyword.toLowerCase()
        const matched = scored.filter((item) =>
          `${item.subject} ${item.description} ${item.category_name || ''} ${item.location || ''}`.toLowerCase().includes(q),
        )
        if (matched.length > 0) scored = matched
      }

      scored.sort((a, b) => b.ai_match.matchScore - a.ai_match.matchScore)

      return res.json({
        mode: 'leads',
        referenceLocation: gardenerArea,
        sortBy,
        totalCandidates: leadRows.length,
        recommendations: scored.slice(0, limit),
        disclaimer: AI_SAFETY_DISCLAIMER,
      })
    }

    return res.status(400).json({ message: 'Invalid recommendation mode. Use services, offers, or leads.' })
  } catch (error) {
    return next(error)
  }
}

async function createRecommendationSummary(req, res, next) {
  const mode = text(req.body?.mode).toLowerCase() || 'services'
  const referenceLocation = text(req.body?.referenceLocation) || 'Zamboanga City'
  const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, 5) : []
  if (items.length === 0) {
    return res.status(400).json({ message: 'At least one candidate item is required to generate an AI summary.' })
  }

  const buildFallbackSummary = () => {
    const lines = items.slice(0, 3).map((item, idx) => {
      const title = text(item.title || item.subject || item.gardenerName) || `Option #${idx + 1}`
      const score = item.matchScore != null ? `${item.matchScore}% match` : 'recommended'
      const reasons = Array.isArray(item.reasons) && item.reasons.length > 0 ? item.reasons.join(', ') : 'matches your criteria'
      return `${idx + 1}. ${title} (${score}) — ${reasons}.`
    })
    return `Top advisory picks near ${referenceLocation}:\n${lines.join('\n')}\n\nNote: Review profiles, quotes, and schedules directly before deciding.`
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.json({
      summary: buildFallbackSummary(),
      source: 'smart_ranking',
      disclaimer: AI_SAFETY_DISCLAIMER,
    })
  }

  let reservedUsageId = null
  const primaryModel = getModelName()
  try {
    const rateCheck = await reserveAiUsageSlot({
      userId: req.user.id,
      feature: 'requirements',
      model: primaryModel,
    })
    if (!rateCheck.allowed) {
      return res.json({
        summary: buildFallbackSummary(),
        source: 'smart_ranking',
        disclaimer: AI_SAFETY_DISCLAIMER,
      })
    }
    reservedUsageId = rateCheck.usageId

    const compactItems = items.map((item, idx) => ({
      rank: idx + 1,
      title: text(item.title || item.subject || item.gardenerName).slice(0, 120),
      provider: text(item.gardenerName || item.providerName).slice(0, 100),
      matchScore: item.matchScore,
      price: item.price ?? null,
      reasons: Array.isArray(item.reasons) ? item.reasons.slice(0, 4) : [],
    }))
    const prompt = [
      `You are HugaTiera's advisory assistant for Zamboanga City gardening services (${mode}).`,
      `Reference location: ${referenceLocation}.`,
      `Write a concise, friendly 3-bullet comparison (under 110 words) highlighting why the top candidates stand out on nearby location, verified reviews, and good conduct of service.`,
      `Never auto-select a provider, never guarantee outcomes, and never quote binding prices.`,
      `Candidates: ${JSON.stringify(compactItems)}`,
    ].join('\n')

    const execution = await executeWithModelFallback('generateGardenPlan', prompt)
    await finalizeAiUsageSlot(reservedUsageId, {
      outcome: 'success',
      errorCode: execution.fallbackUsed ? `FALLBACK_FROM_${execution.primaryErrorCode}` : null,
      model: execution.model,
    })
    return res.json({
      summary: execution.result,
      source: 'gemini',
      model: execution.model,
      disclaimer: AI_SAFETY_DISCLAIMER,
    })
  } catch (error) {
    const classified = classifyAiError(error)
    const auditMeta = buildFailureAuditMetadata(error, primaryModel, classified)
    await finalizeAiUsageSlot(reservedUsageId, {
      outcome: 'error',
      errorCode: auditMeta.errorCode,
      model: auditMeta.model,
    }).catch(() => {})
    // Graceful non-blocking fallback to deterministic smart summary
    return res.json({
      summary: buildFallbackSummary(),
      source: 'smart_ranking',
      disclaimer: AI_SAFETY_DISCLAIMER,
    })
  }
}

async function createGardenImagePreview(req, res, next) {
  if (!isImageGenerationEnabled()) {
    return res.status(501).json({
      code: 'IMAGE_GENERATION_POSTPONED',
      message: 'AI photo concept editing is currently disabled. Set AI_IMAGE_GEN_ENABLED=true in backend/.env to enable free Cloudflare Workers AI previews.',
    })
  }

  const instructions = text(req.body?.instructions ?? req.body?.prompt)
  if (!instructions || instructions.length > 1000) {
    return res.status(400).json({
      message: 'Please describe the gardening changes you want to preview (1 to 1,000 characters).',
    })
  }

  const rawParentId = req.body?.parentImageId ?? req.body?.imageId ?? req.body?.parent_image_id
  const parentImageId = rawParentId !== undefined && rawParentId !== null && String(rawParentId).trim() !== ''
    ? parsePositiveInt(rawParentId)
    : null
  const hasUploadedFile = Boolean(req.file && Buffer.isBuffer(req.file.buffer))

  if (!parentImageId && !hasUploadedFile) {
    return res.status(400).json({
      message: 'Please upload a garden photo or select an existing uploaded photo first.',
    })
  }

  const imageModel = getImageEditModelName()
  let reservedUsageId = null
  let savedGeneratedPath = null

  try {
    let parentImageRow = null
    let sourceBuffer = null

    if (parentImageId) {
      const [rows] = await pool.execute(
        `SELECT ri.id, ri.inquiry_id, ri.uploaded_by, ri.kind, ri.parent_image_id,
                ri.file_path, ri.mime_type, ri.file_size, ri.ai_description, ri.created_at,
                i.status AS inquiry_status
         FROM request_images ri
         LEFT JOIN inquiries i ON i.id = ri.inquiry_id
         WHERE ri.id = ?
         LIMIT 1`,
        [parentImageId],
      )
      parentImageRow = rows[0]
      if (!parentImageRow) {
        return res.status(404).json({ message: 'Garden photo was not found.' })
      }
      if (parentImageRow.uploaded_by !== req.user.id && req.user.role !== 'administrator') {
        return res.status(403).json({ message: 'You can only generate AI previews for garden photos that you uploaded.' })
      }
      if (parentImageRow.inquiry_id && !['open', 'responded'].includes(parentImageRow.inquiry_status)) {
        return res.status(409).json({
          message: 'AI concept previews can only be generated while the service request is open.',
        })
      }
      try {
        const absPath = resolveRequestImagePath(parentImageRow.file_path)
        sourceBuffer = await fsp.readFile(absPath)
      } catch {
        return res.status(404).json({ message: 'Garden photo file was not found on disk.' })
      }
    } else {
      let processedOriginal
      try {
        processedOriginal = await processAndSaveRequestImage(req.file.buffer, req.user.id, 'original')
      } catch (processingError) {
        if (processingError.statusCode === 400) {
          return res.status(400).json({ message: processingError.message })
        }
        throw processingError
      }
      sourceBuffer = await fsp.readFile(processedOriginal.absolutePath)
      try {
        const [origInsert] = await pool.execute(
          `INSERT INTO request_images (inquiry_id, uploaded_by, kind, file_path, mime_type, file_size)
           VALUES (NULL, ?, 'original', ?, ?, ?)`,
          [req.user.id, processedOriginal.relativePath, processedOriginal.mimeType, processedOriginal.fileSize],
        )
        const [origRows] = await pool.execute(
          `SELECT id, inquiry_id, uploaded_by, kind, parent_image_id, file_path, mime_type, file_size, ai_description, created_at
           FROM request_images WHERE id = ? LIMIT 1`,
          [origInsert.insertId],
        )
        parentImageRow = origRows[0]
      } catch (dbErr) {
        await fsp.unlink(processedOriginal.absolutePath).catch(() => {})
        throw dbErr
      }
    }

    const rateCheck = await reserveImageUsageSlot({
      userId: req.user.id,
      inquiryId: parentImageRow.inquiry_id || null,
      requestImageId: parentImageRow.id,
      model: imageModel,
    })
    if (!rateCheck.allowed) {
      return res.status(429).json({
        message: `AI photo concept previews are limited to ${rateCheck.limit} per 24 hours so free daily capacity stays available for everyone. You can still submit your request with your original photo.`,
      })
    }
    reservedUsageId = rateCheck.usageId

    const provider = getAiProvider()
    const edited = await provider.generateGardenImage({
      imageBuffer: sourceBuffer,
      mimeType: parentImageRow.mime_type,
      instructions,
      existingDescription: parentImageRow.ai_description || '',
      model: imageModel,
    })

    const savedGenerated = await processAndSaveRequestImage(edited.imageBuffer, req.user.id, 'ai_generated')
    savedGeneratedPath = savedGenerated.absolutePath

    const [genInsert] = await pool.execute(
      `INSERT INTO request_images
        (inquiry_id, uploaded_by, kind, parent_image_id, file_path, mime_type, file_size, ai_description)
       VALUES (?, ?, 'ai_generated', ?, ?, ?, ?, ?)`,
      [
        parentImageRow.inquiry_id || null,
        req.user.id,
        parentImageRow.id,
        savedGenerated.relativePath,
        savedGenerated.mimeType,
        savedGenerated.fileSize,
        `AI concept preview — requested changes: ${instructions}`.slice(0, 2000),
      ],
    )
    savedGeneratedPath = null

    const [genRows] = await pool.execute(
      `SELECT id, inquiry_id, uploaded_by, kind, parent_image_id, mime_type, file_size, ai_description, created_at
       FROM request_images WHERE id = ? LIMIT 1`,
      [genInsert.insertId],
    )

    await finalizeAiUsageSlot(reservedUsageId, {
      outcome: 'success',
      errorCode: null,
      model: edited.model || imageModel,
    })

    const imageLimit = getImageDailyLimit()
    const imageUsed = await getDailyImageUsageCount(req.user.id)

    return res.status(201).json({
      originalImage: serializeRequestImage(parentImageRow),
      generatedImage: serializeRequestImage(genRows[0]),
      model: edited.model || imageModel,
      refinedPrompt: edited.refinedPrompt || null,
      usage: {
        used: imageUsed,
        limit: imageLimit,
        remaining: Math.max(0, imageLimit - imageUsed),
        windowHours: 24,
      },
      disclaimer: 'AI concept preview is for visual inspiration only — it does not set final prices, confirm a booking, or guarantee exact site results.',
    })
  } catch (error) {
    if (savedGeneratedPath) {
      await fsp.unlink(savedGeneratedPath).catch(() => {})
    }
    const classified = classifyAiError(error)
    const auditMeta = buildFailureAuditMetadata(error, imageModel, classified)
    await finalizeAiUsageSlot(reservedUsageId, {
      outcome: 'error',
      errorCode: auditMeta.errorCode,
      model: auditMeta.model,
    }).catch(() => {})

    if (classified) {
      return res.status(classified.status).json({
        code: classified.code,
        message: classified.message,
      })
    }
    return next(error)
  }
}

module.exports = {
  analyzeUploadedPhoto,
  createGardenImagePreview,
  createGardenPlan,
  createRecommendationSummary,
  createRequirementAssistance,
  getAiUsageStatus,
  getSmartRecommendations,
  streamGardenPlan,
}
