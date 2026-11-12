const fsp = require('fs/promises')
const { pool } = require('../config/database')
const { resolveRequestImagePath } = require('../middleware/upload.middleware')
const { serializeRequestImage } = require('./requestImage.controller')
const {
  AI_SAFETY_DISCLAIMER,
  MAX_INPUT_LENGTH,
  executeWithModelFallback,
  getAiProvider,
  getFallbackModelName,
  getModelName,
  getProviderFailureCode,
} = require('../services/ai.service')

const DEFAULT_HOURLY_LIMIT = 10

function getHourlyLimit() {
  const configured = Number(process.env.AI_HOURLY_LIMIT)
  return Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_HOURLY_LIMIT
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
       AND outcome IN ('success', 'error')
       AND created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)`,
    [userId],
  )
  return Number(row?.used || 0)
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
      imageGenerationEnabled: false,
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

    const execution = await executeWithModelFallback('generateRequirementAssistance', {
      subject,
      description,
      location,
      categories,
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

module.exports = {
  analyzeUploadedPhoto,
  createGardenPlan,
  createRequirementAssistance,
  getAiUsageStatus,
}
