const { pool } = require('../config/database')
const { createNotification } = require('../services/notification.service')
const {
  attachImagesToInquiry,
  serializeRequestImage,
} = require('./requestImage.controller')
const {
  calculatePriceEstimate,
  parseEstimatorInputs,
  parseSelectedAddonItems,
} = require('../utils/priceEstimator')

async function resolveSelectedAddons(conn, parsedItems) {
  if (!Array.isArray(parsedItems) || parsedItems.length === 0) return []
  const ids = parsedItems.map((i) => i.addonId)
  const placeholders = ids.map(() => '?').join(', ')
  const [rows] = await conn.execute(
    `SELECT id, name, item_type, unit, unit_price_min, unit_price_max
     FROM pricing_addons
     WHERE id IN (${placeholders}) AND is_active = TRUE`,
    ids,
  )
  const byId = new Map(rows.map((r) => [r.id, r]))
  const resolved = []
  for (const item of parsedItems) {
    const row = byId.get(item.addonId)
    if (!row) {
      const err = new Error('One or more selected plant or material pricing items are unavailable.')
      err.statusCode = 400
      throw err
    }
    resolved.push({ ...row, quantity: item.quantity })
  }
  return resolved
}

const ALLOWED_RESPONSE_TYPES = new Set([
  'offer',
  'feasible',
  'modifications',
  'cannot_do',
  'interest',
])

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function parseCategorySpecsInput(raw) {
  if (raw === undefined || raw === null || raw === '') return { value: null }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { error: 'Category specifications must be an object.' }
  }
  const entries = Object.entries(raw)
  if (entries.length > 20) {
    return { error: 'Too many category specification fields (maximum 20).' }
  }
  const cleaned = {}
  for (const [key, val] of entries) {
    if (!/^[a-zA-Z0-9_]{1,50}$/.test(key)) {
      return { error: `Invalid specification key "${key}".` }
    }
    if (val === undefined || val === null || val === '') continue
    if (typeof val === 'boolean') {
      cleaned[key] = val
    } else if (typeof val === 'number') {
      if (!Number.isFinite(val) || val < 0 || val > 10000000) {
        return { error: `Invalid numeric value for "${key}".` }
      }
      cleaned[key] = Math.round(val * 100) / 100
    } else if (typeof val === 'string') {
      const trimmed = val.trim()
      if (!trimmed) continue
      if (trimmed.length > 500) {
        return { error: `Specification "${key}" must be 500 characters or fewer.` }
      }
      cleaned[key] = trimmed
    } else if (Array.isArray(val)) {
      const items = val
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean)
      if (items.length === 0) continue
      if (items.length > 20 || items.some((item) => item.length > 120)) {
        return { error: `Specification list "${key}" contains invalid or overly long entries.` }
      }
      cleaned[key] = [...new Set(items)]
    } else {
      return { error: `Unsupported value type for specification "${key}".` }
    }
  }
  return { value: Object.keys(cleaned).length > 0 ? cleaned : null }
}

function deserializeCategorySpecs(raw) {
  if (!raw) return null
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
    } catch {
      return null
    }
  }
  return null
}

function parsePositiveInt(value) {
  const num = Number(value)
  return Number.isInteger(num) && num > 0 ? num : null
}

function validDate(value) {
  return !value || /^\d{4}-\d{2}-\d{2}$/.test(value)
}

async function recordInquiryEvent(connection, {
  inquiryId,
  quotationId = null,
  agreementId = null,
  actorId = null,
  eventType,
  fromStatus = null,
  toStatus = null,
  note = null,
}) {
  await connection.execute(
    `INSERT INTO request_events
      (inquiry_id, quotation_id, agreement_id, actor_id, event_type, from_status, to_status, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      inquiryId,
      quotationId,
      agreementId,
      actorId,
      eventType,
      fromStatus,
      toStatus,
      note ? String(note).slice(0, 255) : null,
    ],
  )
}

async function checkAndPersistLazyExpiry(connection, inquiry, actorId = null) {
  if (!inquiry) return false
  if (
    (inquiry.status === 'open' || inquiry.status === 'responded')
    && Number(inquiry.is_expired) === 1
  ) {
    const prevStatus = inquiry.status
    await connection.execute(
      "UPDATE inquiries SET status = 'expired' WHERE id = ? AND status IN ('open', 'responded')",
      [inquiry.id],
    )
    inquiry.status = 'expired'
    await recordInquiryEvent(connection, {
      inquiryId: inquiry.id,
      actorId: actorId || inquiry.client_id,
      eventType: 'request_expired',
      fromStatus: prevStatus,
      toStatus: 'expired',
      note: 'Service request passed its expiration date',
    })
    await createNotification({
      userId: inquiry.client_id,
      type: 'inquiry_status',
      title: 'Service inquiry expired',
      message: `Your inquiry "${inquiry.subject}" has reached its expiration date.`,
      entityType: 'inquiry',
      entityId: inquiry.id,
      connection,
    })
    return true
  }
  return inquiry.status === 'expired'
}

async function listInquiries(req, res, next) {
  if (!['client', 'gardener'].includes(req.user.role)) {
    return res.status(403).json({ message: 'You do not have permission to access this resource.' })
  }
  try {
    if (req.user.role === 'client') {
      await pool.execute(
        `UPDATE inquiries i
         SET i.status = 'expired'
         WHERE i.client_id = ?
           AND i.status IN ('open', 'responded')
           AND i.expires_at IS NOT NULL
           AND i.expires_at <= NOW()`,
        [req.user.id],
      )

      const [inquiries] = await pool.execute(
        `SELECT i.id, i.request_type, i.client_id, i.gardener_id, i.service_id, i.category_id,
                i.subject, i.description, i.ai_summary, i.requested_date, i.location,
                i.area_sqm, i.work_complexity, i.materials_option, i.site_visit_requested,
                i.estimated_min_amount, i.estimated_max_amount, i.price_comment,
                i.status, i.expires_at, i.created_at, i.updated_at,
                s.title AS service_title,
                sc.name AS category_name,
                u.first_name AS client_first_name, u.last_name AS client_last_name,
                gp.business_name,
                COALESCE(NULLIF(TRIM(gp.business_name), ''), CONCAT(gu.first_name, ' ', gu.last_name)) AS gardener_name,
                (SELECT COUNT(*) FROM quotations q WHERE q.inquiry_id = i.id AND q.status <> 'withdrawn') AS offer_count
         FROM inquiries i
         LEFT JOIN services s ON s.id = i.service_id
         LEFT JOIN service_categories sc ON sc.id = COALESCE(i.category_id, s.category_id)
         JOIN users u ON u.id = i.client_id
         LEFT JOIN users gu ON gu.id = i.gardener_id
         LEFT JOIN gardener_profiles gp ON gp.user_id = i.gardener_id
         WHERE i.client_id = ?
         ORDER BY i.updated_at DESC`,
        [req.user.id],
      )
      return res.json({ inquiries })
    }

    // Gardener: lazily mark any open/responded inquiries targeted to or quoted by this gardener that passed expires_at
    await pool.execute(
      `UPDATE inquiries i
       SET i.status = 'expired'
       WHERE (i.gardener_id = ? OR EXISTS (SELECT 1 FROM quotations q WHERE q.inquiry_id = i.id AND q.gardener_id = ?))
         AND i.status IN ('open', 'responded')
         AND i.expires_at IS NOT NULL
         AND i.expires_at <= NOW()`,
      [req.user.id, req.user.id],
    )

    const [inquiries] = await pool.execute(
      `SELECT i.id, i.request_type, i.client_id, i.gardener_id, i.service_id, i.category_id,
              i.subject, i.description, i.ai_summary, i.requested_date, i.location,
              i.area_sqm, i.work_complexity, i.materials_option, i.site_visit_requested,
              i.estimated_min_amount, i.estimated_max_amount, i.price_comment,
              i.status, i.expires_at, i.created_at, i.updated_at,
              s.title AS service_title,
              sc.name AS category_name,
              u.first_name AS client_first_name, u.last_name AS client_last_name,
              gp.business_name,
              COALESCE(NULLIF(TRIM(gp.business_name), ''), CONCAT(gu.first_name, ' ', gu.last_name)) AS gardener_name,
              my_q.id AS my_quotation_id,
              my_q.status AS my_quotation_status,
              my_q.response_type AS my_response_type,
              my_q.amount AS my_quotation_amount,
              my_q.revision_number AS my_revision_number
       FROM inquiries i
       LEFT JOIN services s ON s.id = i.service_id
       LEFT JOIN service_categories sc ON sc.id = COALESCE(i.category_id, s.category_id)
       JOIN users u ON u.id = i.client_id
       LEFT JOIN users gu ON gu.id = i.gardener_id
       LEFT JOIN gardener_profiles gp ON gp.user_id = i.gardener_id
       LEFT JOIN quotations my_q ON my_q.id = (
         SELECT q2.id
         FROM quotations q2
         WHERE q2.inquiry_id = i.id AND q2.gardener_id = ?
         ORDER BY q2.created_at DESC, q2.id DESC
         LIMIT 1
       )
       WHERE i.gardener_id = ? OR my_q.id IS NOT NULL
       ORDER BY i.updated_at DESC`,
      [req.user.id, req.user.id],
    )
    return res.json({ inquiries })
  } catch (error) {
    return next(error)
  }
}

async function listOpenRequests(req, res, next) {
  try {
    if (req.user.role === 'gardener') {
      const [profiles] = await pool.execute(
        'SELECT is_approved FROM gardener_profiles WHERE user_id = ? LIMIT 1',
        [req.user.id],
      )
      if (!profiles[0] || !profiles[0].is_approved) {
        return res.status(403).json({
          message: 'Your gardener profile must be approved by an administrator before browsing open service requests.',
        })
      }
    } else if (req.user.role !== 'administrator') {
      return res.status(403).json({
        message: 'Only approved gardeners and administrators can browse the open requests board.',
      })
    }

    // Lazily expire any open/responded general requests whose expires_at has passed
    await pool.execute(
      `UPDATE inquiries
       SET status = 'expired'
       WHERE request_type = 'general'
         AND status IN ('open', 'responded')
         AND expires_at IS NOT NULL
         AND expires_at <= NOW()`,
    )

    const rawCategoryId = req.query?.categoryId ?? req.query?.category_id
    const categoryId = (rawCategoryId !== undefined && rawCategoryId !== null && String(rawCategoryId).trim() !== '')
      ? parsePositiveInt(rawCategoryId)
      : null
    const areaFilter = text(req.query?.area ?? req.query?.location)

    const whereClauses = [
      "i.request_type = 'general'",
      "i.status IN ('open', 'responded')",
      '(i.expires_at IS NULL OR i.expires_at > NOW())',
    ]
    const params = [req.user.id]

    if (req.user.role === 'gardener') {
      whereClauses.push('i.client_id <> ?')
      params.push(req.user.id)
    }

    if (categoryId) {
      whereClauses.push('i.category_id = ?')
      params.push(categoryId)
    }
    if (areaFilter) {
      whereClauses.push('i.location LIKE ?')
      params.push(`%${areaFilter}%`)
    }

    const [rows] = await pool.execute(
      `SELECT i.id, i.request_type, i.category_id,
              i.subject, i.description, i.ai_summary, i.requested_date, i.location,
              i.area_sqm, i.work_complexity, i.materials_option, i.site_visit_requested,
              i.estimated_min_amount, i.estimated_max_amount, i.price_comment, i.category_specs,
              i.status, i.expires_at, i.created_at, i.updated_at,
              sc.name AS category_name,
              u.first_name AS client_first_name,
              (SELECT COUNT(*) FROM quotations q WHERE q.inquiry_id = i.id AND q.status IN ('sent', 'accepted')) AS offer_count,
              my_q.id AS my_quotation_id,
              my_q.status AS my_quotation_status,
              my_q.response_type AS my_response_type,
              my_q.amount AS my_quotation_amount
       FROM inquiries i
       LEFT JOIN service_categories sc ON sc.id = i.category_id
       JOIN users u ON u.id = i.client_id AND u.is_active = TRUE
       LEFT JOIN quotations my_q ON my_q.id = (
         SELECT q2.id
         FROM quotations q2
         WHERE q2.inquiry_id = i.id AND q2.gardener_id = ?
         ORDER BY q2.created_at DESC, q2.id DESC
         LIMIT 1
       )
       WHERE ${whereClauses.join(' AND ')}
       ORDER BY i.created_at DESC, i.id DESC`,
      params,
    )

    if (rows.length > 0) {
      const inqIds = rows.map((r) => r.id)
      const placeholders = inqIds.map(() => '?').join(', ')
      const [imageRows] = await pool.execute(
        `SELECT id, inquiry_id, uploaded_by, kind, parent_image_id, mime_type, file_size, ai_description, created_at
         FROM request_images
         WHERE inquiry_id IN (${placeholders})
         ORDER BY created_at ASC, id ASC`,
        inqIds,
      )
      const imagesByInquiry = new Map()
      for (const img of imageRows) {
        if (!imagesByInquiry.has(img.inquiry_id)) imagesByInquiry.set(img.inquiry_id, [])
        imagesByInquiry.get(img.inquiry_id).push(serializeRequestImage(img))
      }
      for (const row of rows) {
        row.images = imagesByInquiry.get(row.id) || []
        row.category_specs = deserializeCategorySpecs(row.category_specs)
      }
    }

    return res.json({ requests: rows })
  } catch (error) {
    return next(error)
  }
}

async function getInquiry(req, res, next) {
  const inquiryId = parsePositiveInt(req.params.inquiryId)
  if (!inquiryId) {
    return res.status(400).json({ message: 'A valid inquiry ID is required.' })
  }

  try {
    const [inquiries] = await pool.execute(
      `SELECT i.id, i.request_type, i.client_id, i.gardener_id, i.service_id, i.category_id,
              i.subject, i.description, i.ai_summary, i.requested_date, i.location,
              i.area_sqm, i.work_complexity, i.materials_option, i.site_visit_requested,
              i.estimated_labor_min, i.estimated_labor_max, i.estimated_materials_min, i.estimated_materials_max,
              i.estimated_min_amount, i.estimated_max_amount, i.price_comment, i.category_specs,
              i.status, i.expires_at, i.created_at, i.updated_at,
              CASE WHEN i.expires_at IS NOT NULL AND i.expires_at <= NOW() THEN 1 ELSE 0 END AS is_expired,
              s.title AS service_title,
              sc.name AS category_name,
              u.first_name AS client_first_name, u.last_name AS client_last_name,
              gp.business_name,
              COALESCE(NULLIF(TRIM(gp.business_name), ''), CONCAT(gu.first_name, ' ', gu.last_name)) AS gardener_name
       FROM inquiries i
       LEFT JOIN services s ON s.id = i.service_id
       LEFT JOIN service_categories sc ON sc.id = COALESCE(i.category_id, s.category_id)
       JOIN users u ON u.id = i.client_id
       LEFT JOIN users gu ON gu.id = i.gardener_id
       LEFT JOIN gardener_profiles gp ON gp.user_id = i.gardener_id
       WHERE i.id = ?
       LIMIT 1`,
      [inquiryId],
    )
    const inquiry = inquiries[0]
    if (!inquiry) {
      return res.status(404).json({ message: 'Inquiry was not found.' })
    }
    inquiry.category_specs = deserializeCategorySpecs(inquiry.category_specs)

    if (
      (inquiry.status === 'open' || inquiry.status === 'responded')
      && Number(inquiry.is_expired) === 1
    ) {
      await checkAndPersistLazyExpiry(pool, inquiry, req.user.id)
    }

    const isOwner = inquiry.client_id === req.user.id
    const isTargetedGardener = inquiry.gardener_id === req.user.id
    const isAdmin = req.user.role === 'administrator'

    if (!isOwner && !isTargetedGardener && !isAdmin) {
      if (inquiry.request_type === 'general' && req.user.role === 'gardener') {
        const [gpRows] = await pool.execute(
          'SELECT is_approved FROM gardener_profiles WHERE user_id = ? LIMIT 1',
          [req.user.id],
        )
        const isApprovedGardener = Boolean(gpRows[0]?.is_approved)
        const [myOffers] = await pool.execute(
          'SELECT id FROM quotations WHERE inquiry_id = ? AND gardener_id = ? LIMIT 1',
          [inquiry.id, req.user.id],
        )
        const hasSubmittedOffer = Boolean(myOffers[0])
        const isOpenBoardVisible = ['open', 'responded'].includes(inquiry.status)

        if (!isApprovedGardener && !hasSubmittedOffer) {
          return res.status(403).json({
            message: 'Your gardener profile must be approved before viewing open service requests.',
          })
        }
        if (!hasSubmittedOffer && !isOpenBoardVisible) {
          return res.status(404).json({ message: 'Inquiry was not found.' })
        }
      } else {
        return res.status(404).json({ message: 'Inquiry was not found.' })
      }
    }

    // Privacy on Case 1 general requests: hide client last name from non-selected providers
    if (inquiry.request_type === 'general' && req.user.role === 'gardener' && !isTargetedGardener) {
      inquiry.client_last_name = null
    }

    const filterToOwnOffersOnly = inquiry.request_type === 'general' && req.user.role === 'gardener'
    const quotationWhere = filterToOwnOffersOnly
      ? 'WHERE q.inquiry_id = ? AND q.gardener_id = ?'
      : 'WHERE q.inquiry_id = ?'
    const quotationParams = filterToOwnOffersOnly
      ? [inquiry.id, req.user.id]
      : [inquiry.id]

    const [quotations] = await pool.execute(
      `SELECT q.id, q.inquiry_id, q.gardener_id, q.amount, q.labor_amount, q.materials_amount, q.materials_breakdown, q.details,
              q.availability_start, q.availability_end, q.estimated_working_days, q.estimated_hours,
              q.status, q.valid_until,
              q.response_type, q.proposed_changes, q.requires_site_visit, q.revision_number, q.locked_at,
              q.created_at, q.updated_at,
              COALESCE(gp.business_name, CONCAT(gu.first_name, ' ', gu.last_name)) AS gardener_name,
              gp.business_name,
              gp.service_area AS gardener_service_area,
              gp.years_of_experience AS gardener_experience_years,
              gp.description AS gardener_bio,
              (SELECT ROUND(AVG(r.rating), 1)
               FROM reviews r
               WHERE r.gardener_id = q.gardener_id AND r.is_visible = TRUE) AS gardener_rating,
              (SELECT COUNT(*)
               FROM reviews r
               WHERE r.gardener_id = q.gardener_id AND r.is_visible = TRUE) AS gardener_review_count,
              (SELECT COUNT(*)
               FROM bookings b
               WHERE b.gardener_id = q.gardener_id AND b.status = 'completed') AS gardener_completed_bookings,
              (SELECT COUNT(*)
               FROM portfolios p
               WHERE p.gardener_id = q.gardener_id) AS gardener_portfolio_count
       FROM quotations q
       JOIN users gu ON gu.id = q.gardener_id
       LEFT JOIN gardener_profiles gp ON gp.user_id = q.gardener_id
       ${quotationWhere}
       ORDER BY q.created_at DESC, q.id DESC`,
      quotationParams,
    )

    if (quotations.length > 0) {
      const qIds = quotations.map((q) => q.id)
      const placeholders = qIds.map(() => '?').join(', ')
      const [revisions] = await pool.execute(
        `SELECT id, quotation_id, revision_number, response_type, amount, labor_amount, materials_amount, materials_breakdown, details,
                proposed_changes, requires_site_visit, availability_start, availability_end,
                estimated_working_days, estimated_hours, valid_until, created_at
         FROM quotation_revisions
         WHERE quotation_id IN (${placeholders})
         ORDER BY revision_number DESC, id DESC`,
        qIds,
      )
      const byQuotation = new Map()
      for (const rev of revisions) {
        if (!byQuotation.has(rev.quotation_id)) byQuotation.set(rev.quotation_id, [])
        byQuotation.get(rev.quotation_id).push(rev)
      }

      // Attach portfolio preview items per gardener for client offer comparison
      const gardenerIds = [...new Set(quotations.map((q) => q.gardener_id))]
      const gPlaceholders = gardenerIds.map(() => '?').join(', ')
      const [portfolioRows] = await pool.execute(
        `SELECT id, gardener_id, title, description, created_at
         FROM portfolios
         WHERE gardener_id IN (${gPlaceholders})
         ORDER BY created_at DESC, id DESC`,
        gardenerIds,
      )
      const portfoliosByGardener = new Map()
      for (const p of portfolioRows) {
        if (!portfoliosByGardener.has(p.gardener_id)) portfoliosByGardener.set(p.gardener_id, [])
        if (portfoliosByGardener.get(p.gardener_id).length < 4) {
          portfoliosByGardener.get(p.gardener_id).push(p)
        }
      }

      for (const q of quotations) {
        q.revisions = byQuotation.get(q.id) || []
        q.gardener_portfolios = portfoliosByGardener.get(q.gardener_id) || []
      }
    }

    const [imageRows] = await pool.execute(
      `SELECT id, inquiry_id, uploaded_by, kind, parent_image_id, mime_type, file_size, ai_description, created_at
       FROM request_images
       WHERE inquiry_id = ?
       ORDER BY created_at ASC, id ASC`,
      [inquiry.id],
    )
    const images = imageRows.map(serializeRequestImage)

    const [agreements] = await pool.execute(
      `SELECT a.*, b.id AS booking_id, b.status AS booking_status
       FROM agreements a
       LEFT JOIN bookings b ON b.agreement_id = a.id
       WHERE a.inquiry_id = ?
         AND (a.client_id = ? OR a.gardener_id = ? OR ? = 'administrator')
       ORDER BY a.version DESC, a.id DESC`,
      [inquiry.id, req.user.id, req.user.id, req.user.role],
    )
    const activeAgreement = agreements.find((a) => a.status === 'proposed' || a.status === 'agreed') || null

    const [events] = await pool.execute(
      `SELECT id, inquiry_id, quotation_id, agreement_id, actor_id, event_type, from_status, to_status, note, created_at
       FROM request_events
       WHERE inquiry_id = ?
       ORDER BY created_at DESC, id DESC`,
      [inquiry.id],
    )

    const [estimateItems] = await pool.execute(
      `SELECT id, inquiry_id, addon_id, item_name, item_type, unit, quantity,
              unit_price_min, unit_price_max, subtotal_min, subtotal_max
       FROM inquiry_estimate_items
       WHERE inquiry_id = ?
       ORDER BY id ASC`,
      [inquiry.id],
    )

    delete inquiry.is_expired
    return res.json({
      inquiry,
      estimateItems,
      quotations,
      images,
      activeAgreement,
      agreements,
      events,
    })
  } catch (error) {
    return next(error)
  }
}

async function estimateInquiryPrice(req, res, next) {
  const estimatorInputs = parseEstimatorInputs(req.body)
  if (estimatorInputs.error) {
    return res.status(400).json({ message: estimatorInputs.error })
  }
  if (!estimatorInputs.areaSqm) {
    return res.status(400).json({ message: 'Please provide an estimated garden area in square meters (areaSqm).' })
  }
  const addonParse = parseSelectedAddonItems(req.body?.addonItems ?? req.body?.addon_items)
  if (addonParse.error) {
    return res.status(400).json({ message: addonParse.error })
  }

  const rawServiceId = req.body?.serviceId ?? req.body?.service_id
  const rawCategoryId = req.body?.categoryId ?? req.body?.category_id
  const serviceId = (rawServiceId !== undefined && rawServiceId !== null && String(rawServiceId).trim() !== '')
    ? parsePositiveInt(rawServiceId)
    : null
  const categoryIdParam = (rawCategoryId !== undefined && rawCategoryId !== null && String(rawCategoryId).trim() !== '')
    ? parsePositiveInt(rawCategoryId)
    : null

  try {
    let service = null
    let resolvedCategoryId = categoryIdParam

    if (serviceId) {
      const [services] = await pool.execute(
        `SELECT s.id, s.category_id, s.indicative_price, s.price_unit
         FROM services s
         WHERE s.id = ? AND s.is_active = TRUE
         LIMIT 1`,
        [serviceId],
      )
      service = services[0] || null
      if (service && !resolvedCategoryId) {
        resolvedCategoryId = service.category_id
      }
    }

    let category = null
    if (resolvedCategoryId) {
      const [cats] = await pool.execute(
        'SELECT id, name, rate_per_sqm_min, rate_per_sqm_max, min_base_fee FROM service_categories WHERE id = ? AND is_active = TRUE LIMIT 1',
        [resolvedCategoryId],
      )
      category = cats[0] || null
    }

    const selectedAddons = await resolveSelectedAddons(pool, addonParse.items)
    const estimate = calculatePriceEstimate({
      areaSqm: estimatorInputs.areaSqm,
      workComplexity: estimatorInputs.workComplexity,
      materialsOption: estimatorInputs.materialsOption,
      category,
      service,
      selectedAddons,
    })

    return res.json({ estimate })
  } catch (error) {
    if (error && error.statusCode === 400) {
      return res.status(400).json({ message: error.message })
    }
    return next(error)
  }
}

async function createInquiry(req, res, next) {
  const rawRequestType = text(req.body?.requestType ?? req.body?.request_type)
  const requestType = rawRequestType || 'direct'
  if (!['direct', 'general'].includes(requestType)) {
    return res.status(400).json({ message: 'Request type must be direct or general.' })
  }

  const rawServiceId = req.body?.serviceId ?? req.body?.service_id
  const rawGardenerId = req.body?.gardenerId ?? req.body?.gardener_id
  const rawCategoryId = req.body?.categoryId ?? req.body?.category_id

  const serviceId = (rawServiceId !== undefined && rawServiceId !== null && String(rawServiceId).trim() !== '')
    ? parsePositiveInt(rawServiceId)
    : null
  const gardenerIdParam = (rawGardenerId !== undefined && rawGardenerId !== null && String(rawGardenerId).trim() !== '')
    ? parsePositiveInt(rawGardenerId)
    : null
  const categoryIdParam = (rawCategoryId !== undefined && rawCategoryId !== null && String(rawCategoryId).trim() !== '')
    ? parsePositiveInt(rawCategoryId)
    : null

  const subject = text(req.body?.subject)
  const description = text(req.body?.description)
  const aiSummary = text(req.body?.aiSummary ?? req.body?.ai_summary) || null
  const requestedDate = text(req.body?.requestedDate ?? req.body?.requested_date) || null
  const location = text(req.body?.location) || null
  const rawImageIds = req.body?.imageIds ?? req.body?.image_ids ?? []
  const rawExpiresInDays = req.body?.expiresInDays ?? req.body?.expires_in_days

  if (requestType === 'general') {
    if (
      (rawServiceId !== undefined && rawServiceId !== null && String(rawServiceId).trim() !== '')
      || (rawGardenerId !== undefined && rawGardenerId !== null && String(rawGardenerId).trim() !== '')
    ) {
      return res.status(400).json({
        message: 'General service requests are open to all approved providers and must not target a specific service or gardener.',
      })
    }
  } else {
    if (!serviceId && !gardenerIdParam) {
      return res.status(400).json({ message: 'A valid service or gardener is required for a direct inquiry.' })
    }
    if (rawServiceId !== undefined && rawServiceId !== null && String(rawServiceId).trim() !== '' && !serviceId) {
      return res.status(400).json({ message: 'A valid service is required.' })
    }
    if (rawGardenerId !== undefined && rawGardenerId !== null && String(rawGardenerId).trim() !== '' && !gardenerIdParam) {
      return res.status(400).json({ message: 'A valid gardener ID is required.' })
    }
  }
  if (rawCategoryId !== undefined && rawCategoryId !== null && String(rawCategoryId).trim() !== '' && !categoryIdParam) {
    return res.status(400).json({ message: 'A valid service category ID is required.' })
  }
  if (!subject || subject.length > 200) {
    return res.status(400).json({ message: 'A subject between 1 and 200 characters is required.' })
  }
  if (!description || description.length > 5000) {
    return res.status(400).json({ message: 'Please describe what you need (up to 5,000 characters).' })
  }
  if (aiSummary && aiSummary.length > 5000) {
    return res.status(400).json({ message: 'AI summary must be 5,000 characters or fewer.' })
  }
  if (!validDate(requestedDate)) {
    return res.status(400).json({ message: 'Requested date must use YYYY-MM-DD format.' })
  }
  if (location && location.length > 255) {
    return res.status(400).json({ message: 'Location is too long.' })
  }
  if (!Array.isArray(rawImageIds)) {
    return res.status(400).json({ message: 'imageIds must be an array of uploaded photo IDs.' })
  }

  const estimatorInputs = parseEstimatorInputs(req.body)
  if (estimatorInputs.error) {
    return res.status(400).json({ message: estimatorInputs.error })
  }
  const addonParse = parseSelectedAddonItems(req.body?.addonItems ?? req.body?.addon_items)
  if (addonParse.error) {
    return res.status(400).json({ message: addonParse.error })
  }
  const categorySpecsParse = parseCategorySpecsInput(req.body?.categorySpecs ?? req.body?.category_specs)
  if (categorySpecsParse.error) {
    return res.status(400).json({ message: categorySpecsParse.error })
  }

  let expiresInDays = requestType === 'general' ? 14 : null
  if (rawExpiresInDays !== undefined && rawExpiresInDays !== null && String(rawExpiresInDays).trim() !== '') {
    expiresInDays = parsePositiveInt(rawExpiresInDays)
    if (!expiresInDays || expiresInDays > 90) {
      return res.status(400).json({ message: 'Expiration period must be between 1 and 90 days.' })
    }
  }

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()

    let resolvedGardenerId = requestType === 'general' ? null : gardenerIdParam
    let resolvedCategoryId = categoryIdParam
    let serviceRow = null

    if (requestType === 'direct') {
      if (serviceId) {
        const [services] = await connection.execute(
          `SELECT s.id, s.gardener_id, s.category_id, s.indicative_price, s.price_unit
           FROM services s
           JOIN users u ON u.id = s.gardener_id AND u.is_active = TRUE
           JOIN gardener_profiles gp ON gp.user_id = s.gardener_id AND gp.is_approved = TRUE
           WHERE s.id = ? AND s.is_active = TRUE
           LIMIT 1
           FOR UPDATE`,
          [serviceId],
        )
        if (!services[0]) {
          await connection.rollback()
          return res.status(404).json({ message: 'Service is unavailable.' })
        }
        if (gardenerIdParam && services[0].gardener_id !== gardenerIdParam) {
          await connection.rollback()
          return res.status(400).json({ message: 'The selected service does not belong to the specified gardener.' })
        }
        serviceRow = services[0]
        resolvedGardenerId = services[0].gardener_id
        resolvedCategoryId = resolvedCategoryId || services[0].category_id
      } else {
        const [gardeners] = await connection.execute(
          `SELECT u.id
           FROM users u
           JOIN gardener_profiles gp ON gp.user_id = u.id AND gp.is_approved = TRUE
           WHERE u.id = ? AND (u.role = 'gardener' OR u.can_act_as_gardener = TRUE) AND u.is_active = TRUE
           LIMIT 1
           FOR UPDATE`,
          [resolvedGardenerId],
        )
        if (!gardeners[0]) {
          await connection.rollback()
          return res.status(404).json({ message: 'Selected gardener is unavailable or not approved.' })
        }
      }
      if (resolvedGardenerId && resolvedGardenerId === req.user.id) {
        await connection.rollback()
        return res.status(409).json({
          code: 'SELF_INQUIRY_FORBIDDEN',
          message: 'You cannot send a service inquiry to your own gardener profile or service.',
        })
      }
    }

    let categoryRow = null
    if (resolvedCategoryId) {
      const [cats] = await connection.execute(
        'SELECT id, name, rate_per_sqm_min, rate_per_sqm_max, min_base_fee FROM service_categories WHERE id = ? AND is_active = TRUE LIMIT 1',
        [resolvedCategoryId],
      )
      if (!cats[0]) {
        await connection.rollback()
        return res.status(400).json({ message: 'Selected service category is unavailable.' })
      }
      categoryRow = cats[0]
    }

    const selectedAddons = await resolveSelectedAddons(connection, addonParse.items)
    const estimate = estimatorInputs.areaSqm
      ? calculatePriceEstimate({
        areaSqm: estimatorInputs.areaSqm,
        workComplexity: estimatorInputs.workComplexity,
        materialsOption: estimatorInputs.materialsOption,
        category: categoryRow,
        service: serviceRow,
        selectedAddons,
      })
      : null

    const expiresSql = expiresInDays ? 'DATE_ADD(NOW(), INTERVAL ? DAY)' : 'NULL'
    const insertParams = [
      requestType,
      req.user.id,
      resolvedGardenerId,
      requestType === 'direct' ? serviceId : null,
      resolvedCategoryId,
      subject,
      description,
      aiSummary,
      requestedDate,
      location,
      estimatorInputs.areaSqm,
      estimatorInputs.workComplexity,
      estimatorInputs.materialsOption,
      estimatorInputs.siteVisitRequested ? 1 : 0,
      estimate ? estimate.estimatedLaborMin : null,
      estimate ? estimate.estimatedLaborMax : null,
      estimate ? estimate.estimatedMaterialsMin : null,
      estimate ? estimate.estimatedMaterialsMax : null,
      estimate ? estimate.estimatedMinAmount : null,
      estimate ? estimate.estimatedMaxAmount : null,
      estimatorInputs.priceComment,
      categorySpecsParse.value ? JSON.stringify(categorySpecsParse.value) : null,
      ...(expiresInDays ? [expiresInDays] : []),
    ]

    const [result] = await connection.execute(
      `INSERT INTO inquiries
        (request_type, client_id, gardener_id, service_id, category_id, subject, description, ai_summary,
         requested_date, location, area_sqm, work_complexity, materials_option, site_visit_requested,
         estimated_labor_min, estimated_labor_max, estimated_materials_min, estimated_materials_max,
         estimated_min_amount, estimated_max_amount, price_comment, category_specs, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${expiresSql})`,
      insertParams,
    )
    const inquiryId = result.insertId

    if (estimate && Array.isArray(estimate.items) && estimate.items.length > 0) {
      for (const item of estimate.items) {
        await connection.execute(
          `INSERT INTO inquiry_estimate_items
            (inquiry_id, addon_id, item_name, item_type, unit, quantity, unit_price_min, unit_price_max, subtotal_min, subtotal_max)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            inquiryId,
            item.addonId,
            item.itemName,
            item.itemType,
            item.unit,
            item.quantity,
            item.unitPriceMin,
            item.unitPriceMax,
            item.subtotalMin,
            item.subtotalMax,
          ],
        )
      }
    }

    let attachedImageIds = []
    if (rawImageIds.length > 0) {
      attachedImageIds = await attachImagesToInquiry(connection, {
        inquiryId,
        clientId: req.user.id,
        imageIds: rawImageIds,
      })
    }

    await recordInquiryEvent(connection, {
      inquiryId,
      actorId: req.user.id,
      eventType: 'inquiry_created',
      fromStatus: null,
      toStatus: 'open',
      note: `${requestType === 'general' ? 'General service request' : 'Direct inquiry'} created${attachedImageIds.length ? ` with ${attachedImageIds.length} photo(s)` : ''}`,
    })

    if (resolvedGardenerId) {
      await createNotification({
        userId: resolvedGardenerId,
        type: 'new_inquiry',
        title: 'New service inquiry',
        message: `A client sent a direct inquiry: ${subject}`,
        entityType: 'inquiry',
        entityId: inquiryId,
        connection,
      })
    }

    const [createdInquiryRows] = await connection.execute(
      'SELECT * FROM inquiries WHERE id = ? LIMIT 1',
      [inquiryId],
    )
    const createdInquiry = createdInquiryRows[0]
    if (createdInquiry) {
      createdInquiry.category_specs = deserializeCategorySpecs(createdInquiry.category_specs)
    }
    const [attachedImageRows] = attachedImageIds.length > 0
      ? await connection.execute(
          `SELECT id, inquiry_id, uploaded_by, kind, parent_image_id, mime_type, file_size, ai_description, created_at
           FROM request_images
           WHERE inquiry_id = ?
           ORDER BY created_at ASC, id ASC`,
          [inquiryId],
        )
      : [[]]

    await connection.commit()
    return res.status(201).json({
      id: inquiryId,
      request_type: requestType,
      gardener_id: resolvedGardenerId,
      status: 'open',
      attachedImageIds,
      estimate,
      inquiry: createdInquiry,
      images: attachedImageRows.map(serializeRequestImage),
    })
  } catch (error) {
    await connection.rollback().catch(() => {})
    if (error && (error.statusCode === 400 || error.statusCode === 403 || error.statusCode === 404)) {
      return res.status(error.statusCode).json({ message: error.message })
    }
    return next(error)
  } finally {
    connection.release()
  }
}

async function createQuotation(req, res, next) {
  const inquiryId = parsePositiveInt(req.params.inquiryId)
  if (!inquiryId) {
    return res.status(400).json({ message: 'A valid inquiry ID is required.' })
  }

  const responseType = text(req.body?.responseType ?? req.body?.response_type) || 'offer'
  if (!ALLOWED_RESPONSE_TYPES.has(responseType)) {
    return res.status(400).json({
      message: 'Response type must be one of: offer, feasible, modifications, cannot_do, or interest.',
    })
  }

  const rawAmount = req.body?.amount
  let amount = (rawAmount === '' || rawAmount === null || rawAmount === undefined) ? null : Number(rawAmount)
  const rawLabor = req.body?.laborAmount ?? req.body?.labor_amount
  const laborAmount = (rawLabor === '' || rawLabor === null || rawLabor === undefined) ? null : Number(rawLabor)
  const rawMaterials = req.body?.materialsAmount ?? req.body?.materials_amount
  const materialsAmount = (rawMaterials === '' || rawMaterials === null || rawMaterials === undefined) ? null : Number(rawMaterials)
  const materialsBreakdown = text(req.body?.materialsBreakdown ?? req.body?.materials_breakdown) || null
  if (amount === null && (laborAmount !== null || materialsAmount !== null)) {
    const sum = (Number.isFinite(laborAmount) ? laborAmount : 0) + (Number.isFinite(materialsAmount) ? materialsAmount : 0)
    amount = Number(sum.toFixed(2))
  }
  const details = text(req.body?.details)
  const proposedChanges = text(req.body?.proposedChanges ?? req.body?.proposed_changes) || null
  const rawRequiresSiteVisit = req.body?.requiresSiteVisit ?? req.body?.requires_site_visit
  const requiresSiteVisit = rawRequiresSiteVisit === true || rawRequiresSiteVisit === 'true' || rawRequiresSiteVisit === 1 || rawRequiresSiteVisit === '1'
  const availabilityStart = text(req.body?.availabilityStart ?? req.body?.availability_start) || null
  const availabilityEnd = text(req.body?.availabilityEnd ?? req.body?.availability_end) || null
  const rawEstDays = req.body?.estimatedWorkingDays ?? req.body?.estimated_working_days
  const estimatedWorkingDays = (rawEstDays === '' || rawEstDays === null || rawEstDays === undefined) ? null : Number(rawEstDays)
  const rawEstHours = req.body?.estimatedHours ?? req.body?.estimated_hours
  const estimatedHours = (rawEstHours === '' || rawEstHours === null || rawEstHours === undefined) ? null : Number(rawEstHours)
  const validUntil = text(req.body?.validUntil ?? req.body?.valid_until) || null

  if (!details || details.length > 5000) {
    return res.status(400).json({ message: 'Quotation details are required (up to 5,000 characters).' })
  }
  if (responseType === 'modifications' && !proposedChanges) {
    return res.status(400).json({
      message: 'Please describe your proposed modifications when selecting the modifications response type.',
    })
  }
  if (proposedChanges && proposedChanges.length > 5000) {
    return res.status(400).json({ message: 'Proposed modifications must be 5,000 characters or fewer.' })
  }
  if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
    return res.status(400).json({ message: 'Quotation amount must be a non-negative number.' })
  }
  if (laborAmount !== null && (!Number.isFinite(laborAmount) || laborAmount < 0)) {
    return res.status(400).json({ message: 'Labor amount must be a non-negative number.' })
  }
  if (materialsAmount !== null && (!Number.isFinite(materialsAmount) || materialsAmount < 0)) {
    return res.status(400).json({ message: 'Plants & materials amount must be a non-negative number.' })
  }
  if (materialsBreakdown && materialsBreakdown.length > 2000) {
    return res.status(400).json({ message: 'Materials breakdown note must be 2,000 characters or fewer.' })
  }
  if (estimatedWorkingDays !== null && (!Number.isFinite(estimatedWorkingDays) || estimatedWorkingDays <= 0 || estimatedWorkingDays > 90)) {
    return res.status(400).json({ message: 'Estimated working days must be a positive number up to 90.' })
  }
  if (estimatedHours !== null && (!Number.isFinite(estimatedHours) || estimatedHours <= 0 || estimatedHours > 500)) {
    return res.status(400).json({ message: 'Estimated working hours must be a positive number up to 500.' })
  }
  if (![availabilityStart, availabilityEnd, validUntil].every(validDate)) {
    return res.status(400).json({ message: 'Quotation dates must use YYYY-MM-DD format.' })
  }
  if (availabilityStart && availabilityEnd && availabilityEnd < availabilityStart) {
    return res.status(400).json({ message: 'Availability end date cannot be earlier than the start date.' })
  }

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()

    // Verify gardener profile is approved
    const [profiles] = await connection.execute(
      'SELECT is_approved FROM gardener_profiles WHERE user_id = ? LIMIT 1',
      [req.user.id],
    )
    if (!profiles[0] || !profiles[0].is_approved) {
      await connection.rollback()
      return res.status(403).json({
        message: 'Your gardener profile must be approved by an administrator before responding to inquiries.',
      })
    }

    const [inquiries] = await connection.execute(
      `SELECT id, request_type, status, client_id, gardener_id, subject,
              CASE WHEN expires_at IS NOT NULL AND expires_at <= NOW() THEN 1 ELSE 0 END AS is_expired
       FROM inquiries
       WHERE id = ?
       LIMIT 1
       FOR UPDATE`,
      [inquiryId],
    )
    const inquiry = inquiries[0]
    if (!inquiry) {
      await connection.rollback()
      return res.status(404).json({ message: 'Inquiry was not found.' })
    }

    if (inquiry.request_type === 'direct' && inquiry.gardener_id !== req.user.id) {
      await connection.rollback()
      return res.status(403).json({
        message: 'Only the targeted gardener can respond to this direct service inquiry.',
      })
    }

    if (await checkAndPersistLazyExpiry(connection, inquiry, req.user.id)) {
      await connection.commit()
      return res.status(409).json({
        message: 'This inquiry has expired and is no longer accepting quotations.',
      })
    }

    if (['closed', 'cancelled', 'provider_selected', 'in_agreement', 'confirmed', 'expired'].includes(inquiry.status)) {
      await connection.rollback()
      return res.status(409).json({ message: 'This inquiry is no longer accepting quotations.' })
    }

    // Check if this gardener already has an active offer on this inquiry
    const [existingActive] = await connection.execute(
      `SELECT id, status FROM quotations
       WHERE inquiry_id = ? AND gardener_id = ? AND status IN ('draft', 'sent', 'accepted')
       LIMIT 1
       FOR UPDATE`,
      [inquiryId, req.user.id],
    )
    if (existingActive[0]) {
      await connection.rollback()
      return res.status(409).json({
        message: 'You already have an active quotation for this inquiry. Revise your existing quotation instead.',
      })
    }

    if (inquiry.client_id === req.user.id) {
      await connection.rollback()
      return res.status(409).json({
        code: 'SELF_OFFER_FORBIDDEN',
        message: 'You cannot submit a quotation on your own service request.',
      })
    }

    const [result] = await connection.execute(
      `INSERT INTO quotations
        (inquiry_id, gardener_id, amount, labor_amount, materials_amount, materials_breakdown,
         details, availability_start, availability_end,
         estimated_working_days, estimated_hours,
         status, valid_until, response_type, proposed_changes, requires_site_visit, revision_number)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'sent', ?, ?, ?, ?, 1)`,
      [
        inquiryId,
        req.user.id,
        amount,
        laborAmount !== null ? Number(laborAmount.toFixed(2)) : null,
        materialsAmount !== null ? Number(materialsAmount.toFixed(2)) : null,
        materialsBreakdown,
        details,
        availabilityStart,
        availabilityEnd,
        estimatedWorkingDays !== null ? Math.round(estimatedWorkingDays * 10) / 10 : null,
        estimatedHours !== null ? Math.round(estimatedHours * 10) / 10 : null,
        validUntil,
        responseType,
        proposedChanges,
        requiresSiteVisit ? 1 : 0,
      ],
    )

    const prevStatus = inquiry.status
    await connection.execute("UPDATE inquiries SET status = 'responded' WHERE id = ?", [inquiryId])

    await recordInquiryEvent(connection, {
      inquiryId,
      quotationId: result.insertId,
      actorId: req.user.id,
      eventType: 'quotation_sent',
      fromStatus: prevStatus,
      toStatus: 'responded',
      note: `Gardener submitted response (${responseType}) v1${requiresSiteVisit ? ' · on-site inspection requested' : ''}`,
    })

    await createNotification({
      userId: inquiry.client_id,
      type: 'new_quotation',
      title: 'New quotation received',
      message: 'A gardener sent a response and indicative quotation for your inquiry.',
      entityType: 'inquiry',
      entityId: inquiryId,
      connection,
    })

    const [createdQuotationRows] = await connection.execute(
      'SELECT * FROM quotations WHERE id = ? LIMIT 1',
      [result.insertId],
    )

    await connection.commit()
    return res.status(201).json({
      id: result.insertId,
      status: 'sent',
      response_type: responseType,
      revision_number: 1,
      quotation: createdQuotationRows[0],
    })
  } catch (error) {
    await connection.rollback().catch(() => {})
    if (error && error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        message: 'You already have an active quotation for this inquiry.',
      })
    }
    return next(error)
  } finally {
    connection.release()
  }
}

async function reviseQuotation(req, res, next) {
  const quotationId = parsePositiveInt(req.params.quotationId)
  if (!quotationId) {
    return res.status(400).json({ message: 'A valid quotation ID is required.' })
  }

  const responseType = text(req.body?.responseType ?? req.body?.response_type) || 'offer'
  if (!ALLOWED_RESPONSE_TYPES.has(responseType)) {
    return res.status(400).json({
      message: 'Response type must be one of: offer, feasible, modifications, cannot_do, or interest.',
    })
  }

  const rawAmount = req.body?.amount
  let amount = (rawAmount === '' || rawAmount === null || rawAmount === undefined) ? null : Number(rawAmount)
  const rawLabor = req.body?.laborAmount ?? req.body?.labor_amount
  const laborAmount = (rawLabor === '' || rawLabor === null || rawLabor === undefined) ? null : Number(rawLabor)
  const rawMaterials = req.body?.materialsAmount ?? req.body?.materials_amount
  const materialsAmount = (rawMaterials === '' || rawMaterials === null || rawMaterials === undefined) ? null : Number(rawMaterials)
  const materialsBreakdown = text(req.body?.materialsBreakdown ?? req.body?.materials_breakdown) || null
  if (amount === null && (laborAmount !== null || materialsAmount !== null)) {
    const sum = (Number.isFinite(laborAmount) ? laborAmount : 0) + (Number.isFinite(materialsAmount) ? materialsAmount : 0)
    amount = Number(sum.toFixed(2))
  }
  const details = text(req.body?.details)
  const proposedChanges = text(req.body?.proposedChanges ?? req.body?.proposed_changes) || null
  const rawRequiresSiteVisit = req.body?.requiresSiteVisit ?? req.body?.requires_site_visit
  const requiresSiteVisit = rawRequiresSiteVisit === true || rawRequiresSiteVisit === 'true' || rawRequiresSiteVisit === 1 || rawRequiresSiteVisit === '1'
  const availabilityStart = text(req.body?.availabilityStart ?? req.body?.availability_start) || null
  const availabilityEnd = text(req.body?.availabilityEnd ?? req.body?.availability_end) || null
  const rawEstDays = req.body?.estimatedWorkingDays ?? req.body?.estimated_working_days
  const estimatedWorkingDays = (rawEstDays === '' || rawEstDays === null || rawEstDays === undefined) ? null : Number(rawEstDays)
  const rawEstHours = req.body?.estimatedHours ?? req.body?.estimated_hours
  const estimatedHours = (rawEstHours === '' || rawEstHours === null || rawEstHours === undefined) ? null : Number(rawEstHours)
  const validUntil = text(req.body?.validUntil ?? req.body?.valid_until) || null

  if (!details || details.length > 5000) {
    return res.status(400).json({ message: 'Quotation details are required (up to 5,000 characters).' })
  }
  if (responseType === 'modifications' && !proposedChanges) {
    return res.status(400).json({
      message: 'Please describe your proposed modifications when selecting the modifications response type.',
    })
  }
  if (proposedChanges && proposedChanges.length > 5000) {
    return res.status(400).json({ message: 'Proposed modifications must be 5,000 characters or fewer.' })
  }
  if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
    return res.status(400).json({ message: 'Quotation amount must be a non-negative number.' })
  }
  if (laborAmount !== null && (!Number.isFinite(laborAmount) || laborAmount < 0)) {
    return res.status(400).json({ message: 'Labor amount must be a non-negative number.' })
  }
  if (materialsAmount !== null && (!Number.isFinite(materialsAmount) || materialsAmount < 0)) {
    return res.status(400).json({ message: 'Plants & materials amount must be a non-negative number.' })
  }
  if (materialsBreakdown && materialsBreakdown.length > 2000) {
    return res.status(400).json({ message: 'Materials breakdown note must be 2,000 characters or fewer.' })
  }
  if (estimatedWorkingDays !== null && (!Number.isFinite(estimatedWorkingDays) || estimatedWorkingDays <= 0 || estimatedWorkingDays > 90)) {
    return res.status(400).json({ message: 'Estimated working days must be a positive number up to 90.' })
  }
  if (estimatedHours !== null && (!Number.isFinite(estimatedHours) || estimatedHours <= 0 || estimatedHours > 500)) {
    return res.status(400).json({ message: 'Estimated working hours must be a positive number up to 500.' })
  }
  if (![availabilityStart, availabilityEnd, validUntil].every(validDate)) {
    return res.status(400).json({ message: 'Quotation dates must use YYYY-MM-DD format.' })
  }
  if (availabilityStart && availabilityEnd && availabilityEnd < availabilityStart) {
    return res.status(400).json({ message: 'Availability end date cannot be earlier than the start date.' })
  }

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()

    const [lookup] = await connection.execute(
      'SELECT id, inquiry_id, gardener_id FROM quotations WHERE id = ? LIMIT 1',
      [quotationId],
    )
    if (!lookup[0]) {
      await connection.rollback()
      return res.status(404).json({ message: 'Quotation was not found.' })
    }
    if (lookup[0].gardener_id !== req.user.id) {
      await connection.rollback()
      return res.status(403).json({ message: 'You can only revise your own quotation.' })
    }

    // Lock parent inquiry first
    const [inquiries] = await connection.execute(
      `SELECT id, client_id, status, subject,
              CASE WHEN expires_at IS NOT NULL AND expires_at <= NOW() THEN 1 ELSE 0 END AS is_expired
       FROM inquiries
       WHERE id = ?
       LIMIT 1
       FOR UPDATE`,
      [lookup[0].inquiry_id],
    )
    const inquiry = inquiries[0]

    if (await checkAndPersistLazyExpiry(connection, inquiry, req.user.id)) {
      await connection.commit()
      return res.status(409).json({
        message: 'This service request has expired and existing offers can no longer be revised.',
      })
    }

    if (['closed', 'cancelled', 'in_agreement', 'confirmed', 'expired'].includes(inquiry.status)) {
      await connection.rollback()
      return res.status(409).json({
        message: `Quotations cannot be revised while the inquiry is ${inquiry.status}.`,
      })
    }

    // Lock quotation row
    const [qRows] = await connection.execute(
      'SELECT * FROM quotations WHERE id = ? LIMIT 1 FOR UPDATE',
      [quotationId],
    )
    const current = qRows[0]

    if (current.locked_at !== null || current.status === 'accepted') {
      await connection.rollback()
      return res.status(409).json({
        message: 'This quotation has already been accepted by the client and is locked. Any further changes require a mutual agreement revision.',
      })
    }

    if (current.status !== 'sent') {
      await connection.rollback()
      return res.status(409).json({
        message: `Cannot revise a quotation whose status is ${current.status}.`,
      })
    }

    // Snapshot superseded quotation version into quotation_revisions
    await connection.execute(
      `INSERT INTO quotation_revisions
        (quotation_id, revision_number, response_type, amount, labor_amount, materials_amount, materials_breakdown,
         details, proposed_changes, requires_site_visit,
         availability_start, availability_end, estimated_working_days, estimated_hours, valid_until)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        current.id,
        current.revision_number,
        current.response_type,
        current.amount,
        current.labor_amount,
        current.materials_amount,
        current.materials_breakdown,
        current.details,
        current.proposed_changes,
        current.requires_site_visit ? 1 : 0,
        current.availability_start,
        current.availability_end,
        current.estimated_working_days,
        current.estimated_hours,
        current.valid_until,
      ],
    )

    const nextRevision = Number(current.revision_number) + 1
    await connection.execute(
      `UPDATE quotations
       SET amount = ?,
           labor_amount = ?,
           materials_amount = ?,
           materials_breakdown = ?,
           details = ?,
           availability_start = ?,
           availability_end = ?,
           estimated_working_days = ?,
           estimated_hours = ?,
           valid_until = ?,
           response_type = ?,
           proposed_changes = ?,
           requires_site_visit = ?,
           revision_number = ?
       WHERE id = ?`,
      [
        amount,
        laborAmount !== null ? Number(laborAmount.toFixed(2)) : null,
        materialsAmount !== null ? Number(materialsAmount.toFixed(2)) : null,
        materialsBreakdown,
        details,
        availabilityStart,
        availabilityEnd,
        estimatedWorkingDays !== null ? Math.round(estimatedWorkingDays * 10) / 10 : null,
        estimatedHours !== null ? Math.round(estimatedHours * 10) / 10 : null,
        validUntil,
        responseType,
        proposedChanges,
        requiresSiteVisit ? 1 : 0,
        nextRevision,
        current.id,
      ],
    )

    await recordInquiryEvent(connection, {
      inquiryId: inquiry.id,
      quotationId: current.id,
      actorId: req.user.id,
      eventType: 'quotation_revised',
      fromStatus: `v${current.revision_number}`,
      toStatus: `v${nextRevision}`,
      note: `Quotation revised to v${nextRevision} (${responseType})${requiresSiteVisit ? ' · on-site inspection requested' : ''}`,
    })

    await createNotification({
      userId: inquiry.client_id,
      type: 'quotation_revised',
      title: 'Quotation updated',
      message: `The gardener revised their quotation to v${nextRevision}.`,
      entityType: 'inquiry',
      entityId: inquiry.id,
      connection,
    })

    const [updatedRows] = await connection.execute(
      'SELECT * FROM quotations WHERE id = ? LIMIT 1',
      [current.id],
    )
    const [revisions] = await connection.execute(
      'SELECT * FROM quotation_revisions WHERE quotation_id = ? ORDER BY revision_number DESC',
      [current.id],
    )

    await connection.commit()
    return res.json({
      quotation: {
        ...updatedRows[0],
        revisions,
      },
      revisions,
    })
  } catch (error) {
    await connection.rollback().catch(() => {})
    return next(error)
  } finally {
    connection.release()
  }
}

async function withdrawQuotation(req, res, next) {
  const quotationId = parsePositiveInt(req.params.quotationId)
  if (!quotationId) {
    return res.status(400).json({ message: 'A valid quotation ID is required.' })
  }

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()

    const [lookup] = await connection.execute(
      'SELECT id, inquiry_id, gardener_id FROM quotations WHERE id = ? LIMIT 1',
      [quotationId],
    )
    if (!lookup[0]) {
      await connection.rollback()
      return res.status(404).json({ message: 'Quotation was not found.' })
    }
    if (lookup[0].gardener_id !== req.user.id) {
      await connection.rollback()
      return res.status(403).json({ message: 'You can only withdraw your own quotation.' })
    }

    const [inquiries] = await connection.execute(
      'SELECT id, client_id, status FROM inquiries WHERE id = ? LIMIT 1 FOR UPDATE',
      [lookup[0].inquiry_id],
    )
    const inquiry = inquiries[0]

    const [qRows] = await connection.execute(
      'SELECT * FROM quotations WHERE id = ? LIMIT 1 FOR UPDATE',
      [quotationId],
    )
    const current = qRows[0]

    if (current.locked_at !== null || current.status === 'accepted') {
      await connection.rollback()
      return res.status(409).json({
        message: 'Accepted quotations are locked and cannot be withdrawn unilaterally.',
      })
    }
    if (current.status !== 'sent') {
      await connection.rollback()
      return res.status(409).json({
        message: `Quotation is already ${current.status}.`,
      })
    }

    await connection.execute(
      "UPDATE quotations SET status = 'withdrawn' WHERE id = ?",
      [current.id],
    )

    await recordInquiryEvent(connection, {
      inquiryId: inquiry.id,
      quotationId: current.id,
      actorId: req.user.id,
      eventType: 'quotation_withdrawn',
      fromStatus: 'sent',
      toStatus: 'withdrawn',
      note: 'Gardener withdrew quotation',
    })

    await createNotification({
      userId: inquiry.client_id,
      type: 'quotation_status',
      title: 'Quotation withdrawn',
      message: 'A gardener withdrew their quotation on your inquiry.',
      entityType: 'inquiry',
      entityId: inquiry.id,
      connection,
    })

    await connection.commit()
    return res.json({
      status: 'withdrawn',
      quotation: {
        ...current,
        status: 'withdrawn',
      },
    })
  } catch (error) {
    await connection.rollback().catch(() => {})
    return next(error)
  } finally {
    connection.release()
  }
}

async function updateQuotationStatus(req, res, next) {
  const quotationId = parsePositiveInt(req.params.quotationId)
  if (!quotationId) {
    return res.status(400).json({ message: 'A valid quotation ID is required.' })
  }
  const status = text(req.body?.status)
  if (!['accepted', 'declined'].includes(status)) {
    return res.status(400).json({ message: 'Quotation status must be accepted or declined.' })
  }

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()

    const [lookup] = await connection.execute(
      `SELECT q.id, q.inquiry_id, i.client_id
       FROM quotations q
       JOIN inquiries i ON i.id = q.inquiry_id
       WHERE q.id = ?
       LIMIT 1`,
      [quotationId],
    )
    if (!lookup[0]) {
      await connection.rollback()
      return res.status(404).json({ message: 'Quotation was not found.' })
    }
    if (lookup[0].client_id !== req.user.id) {
      await connection.rollback()
      return res.status(403).json({ message: 'Only the owning client can accept or decline this quotation.' })
    }

    // Lock parent inquiry first
    const [inquiries] = await connection.execute(
      `SELECT id, request_type, client_id, gardener_id, status, subject,
              CASE WHEN expires_at IS NOT NULL AND expires_at <= NOW() THEN 1 ELSE 0 END AS is_expired
       FROM inquiries
       WHERE id = ?
       LIMIT 1
       FOR UPDATE`,
      [lookup[0].inquiry_id],
    )
    const inquiry = inquiries[0]

    if (await checkAndPersistLazyExpiry(connection, inquiry, req.user.id)) {
      await connection.commit()
      return res.status(409).json({
        message: 'This inquiry has expired. Renew the inquiry before accepting an offer.',
      })
    }

    if (['closed', 'cancelled', 'confirmed', 'expired'].includes(inquiry.status)) {
      await connection.rollback()
      return res.status(409).json({
        message: `Cannot update quotation status because the inquiry is ${inquiry.status}.`,
      })
    }

    // Lock target quotation
    const [quotations] = await connection.execute(
      'SELECT * FROM quotations WHERE id = ? LIMIT 1 FOR UPDATE',
      [quotationId],
    )
    const quotation = quotations[0]

    let nextInquiryStatus = inquiry.status

    if (status === 'accepted') {
      if (quotation.status !== 'sent') {
        await connection.rollback()
        return res.status(409).json({
          message: `Quotation is already ${quotation.status} and cannot be accepted.`,
        })
      }

      if (quotation.response_type === 'cannot_do') {
        await connection.rollback()
        return res.status(409).json({
          message: 'A provider response marked as cannot_do cannot be accepted.',
        })
      }

      // Ensure no other quotation is already accepted on this inquiry
      const [alreadyAccepted] = await connection.execute(
        "SELECT id FROM quotations WHERE inquiry_id = ? AND status = 'accepted' AND id <> ? LIMIT 1 FOR UPDATE",
        [inquiry.id, quotation.id],
      )
      if (alreadyAccepted[0]) {
        await connection.rollback()
        return res.status(409).json({
          message: 'Another quotation has already been accepted for this inquiry.',
        })
      }

      await connection.execute(
        "UPDATE quotations SET status = 'accepted', locked_at = COALESCE(locked_at, NOW()) WHERE id = ?",
        [quotation.id],
      )

      const prevInquiryStatus = inquiry.status
      nextInquiryStatus = inquiry.status === 'in_agreement' ? 'in_agreement' : 'provider_selected'
      await connection.execute(
        'UPDATE inquiries SET status = ?, gardener_id = ? WHERE id = ?',
        [nextInquiryStatus, quotation.gardener_id, inquiry.id],
      )

      await recordInquiryEvent(connection, {
        inquiryId: inquiry.id,
        quotationId: quotation.id,
        actorId: req.user.id,
        eventType: 'quotation_accepted',
        fromStatus: prevInquiryStatus,
        toStatus: nextInquiryStatus,
        note: `Client accepted quotation #${quotation.id} (v${quotation.revision_number}); quotation locked`,
      })
    } else {
      // status === 'declined'
      if (!['sent', 'accepted'].includes(quotation.status)) {
        await connection.rollback()
        return res.status(409).json({
          message: `Quotation is already ${quotation.status} and cannot be declined.`,
        })
      }

      const wasAccepted = quotation.status === 'accepted'
      if (wasAccepted) {
        const [activeAgreements] = await connection.execute(
          "SELECT id, status FROM agreements WHERE inquiry_id = ? AND status IN ('proposed', 'agreed') LIMIT 1 FOR UPDATE",
          [inquiry.id],
        )
        if (activeAgreements[0]) {
          await connection.rollback()
          return res.status(409).json({
            message: 'Cancel the active agreement before declining an accepted offer.',
          })
        }
      }

      await connection.execute(
        "UPDATE quotations SET status = 'declined' WHERE id = ?",
        [quotation.id],
      )

      if (wasAccepted) {
        const [remainingSent] = await connection.execute(
          "SELECT id FROM quotations WHERE inquiry_id = ? AND status = 'sent' LIMIT 1",
          [inquiry.id],
        )
        nextInquiryStatus = remainingSent[0] ? 'responded' : 'open'
        const nextGardenerId = inquiry.request_type === 'general' ? null : inquiry.gardener_id
        await connection.execute(
          'UPDATE inquiries SET status = ?, gardener_id = ? WHERE id = ?',
          [nextInquiryStatus, nextGardenerId, inquiry.id],
        )
      }

      await recordInquiryEvent(connection, {
        inquiryId: inquiry.id,
        quotationId: quotation.id,
        actorId: req.user.id,
        eventType: 'quotation_declined',
        fromStatus: quotation.status,
        toStatus: 'declined',
        note: wasAccepted
          ? `Client declined previously accepted quotation #${quotation.id}; inquiry returned to ${nextInquiryStatus}`
          : `Client declined quotation #${quotation.id}`,
      })
    }

    await createNotification({
      userId: quotation.gardener_id,
      type: 'quotation_status',
      title: `Quotation ${status}`,
      message: `The client ${status} your quotation${status === 'accepted' ? '. Please proceed to the mutual agreement step to confirm scope, price, and schedule.' : '.'}`,
      entityType: 'inquiry',
      entityId: inquiry.id,
      connection,
    })

    const [updatedQuotationRows] = await connection.execute(
      'SELECT * FROM quotations WHERE id = ? LIMIT 1',
      [quotation.id],
    )

    await connection.commit()
    return res.json({
      status,
      inquiryStatus: nextInquiryStatus,
      quotation: updatedQuotationRows[0],
      booking: null,
    })
  } catch (error) {
    await connection.rollback().catch(() => {})
    return next(error)
  } finally {
    connection.release()
  }
}

async function updateInquiryStatus(req, res, next) {
  const inquiryId = parsePositiveInt(req.params.inquiryId)
  if (!inquiryId) {
    return res.status(400).json({ message: 'A valid inquiry ID is required.' })
  }
  const status = text(req.body?.status)
  if (!['closed', 'cancelled'].includes(status)) {
    return res.status(400).json({ message: 'Inquiry status must be closed or cancelled.' })
  }

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [inquiries] = await connection.execute(
      'SELECT * FROM inquiries WHERE id = ? LIMIT 1 FOR UPDATE',
      [inquiryId],
    )
    const inquiry = inquiries[0]
    if (!inquiry || (inquiry.client_id !== req.user.id && inquiry.gardener_id !== req.user.id)) {
      await connection.rollback()
      return res.status(404).json({ message: 'Inquiry was not found.' })
    }

    if (inquiry.status === 'confirmed') {
      await connection.rollback()
      return res.status(409).json({
        message: 'Confirmed inquiries already have an active booking and cannot be closed or cancelled here.',
      })
    }

    if (['closed', 'cancelled'].includes(inquiry.status)) {
      await connection.rollback()
      return res.status(404).json({ message: 'Inquiry was not found or is already closed.' })
    }

    if (status === 'cancelled' && req.user.id !== inquiry.client_id) {
      await connection.rollback()
      return res.status(403).json({ message: 'Only the client can cancel an inquiry.' })
    }

    const prevStatus = inquiry.status
    await connection.execute(
      'UPDATE inquiries SET status = ? WHERE id = ?',
      [status, inquiry.id],
    )

    // Cancel any active proposed agreement on this inquiry
    await connection.execute(
      "UPDATE agreements SET status = 'cancelled' WHERE inquiry_id = ? AND status = 'proposed'",
      [inquiry.id],
    )

    await recordInquiryEvent(connection, {
      inquiryId: inquiry.id,
      actorId: req.user.id,
      eventType: `inquiry_${status}`,
      fromStatus: prevStatus,
      toStatus: status,
      note: `Inquiry marked as ${status}`,
    })

    const recipientId = req.user.id === inquiry.client_id ? inquiry.gardener_id : inquiry.client_id
    if (recipientId) {
      await createNotification({
        userId: recipientId,
        type: 'inquiry_status',
        title: `Inquiry ${status}`,
        message: `The service inquiry "${inquiry.subject}" was marked as ${status}.`,
        entityType: 'inquiry',
        entityId: inquiry.id,
        connection,
      })
    }

    await connection.commit()
    return res.json({
      status,
      inquiry: {
        ...inquiry,
        status,
      },
    })
  } catch (error) {
    await connection.rollback().catch(() => {})
    return next(error)
  } finally {
    connection.release()
  }
}

async function renewInquiry(req, res, next) {
  const inquiryId = parsePositiveInt(req.params.inquiryId)
  if (!inquiryId) {
    return res.status(400).json({ message: 'A valid inquiry ID is required.' })
  }

  let expiresInDays = 14
  if (req.body?.expiresInDays !== undefined && req.body?.expiresInDays !== null && req.body?.expiresInDays !== '') {
    const parsedDays = Number(req.body.expiresInDays)
    if (!Number.isInteger(parsedDays) || parsedDays < 1 || parsedDays > 90) {
      return res.status(400).json({
        message: 'expiresInDays must be an integer between 1 and 90 days.',
      })
    }
    expiresInDays = parsedDays
  }

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [inquiries] = await connection.execute(
      'SELECT * FROM inquiries WHERE id = ? LIMIT 1 FOR UPDATE',
      [inquiryId],
    )
    const inquiry = inquiries[0]
    if (!inquiry) {
      await connection.rollback()
      return res.status(404).json({ message: 'Inquiry was not found.' })
    }
    if (inquiry.client_id !== req.user.id) {
      await connection.rollback()
      return res.status(403).json({ message: 'Only the owning client can renew this inquiry.' })
    }

    if (['provider_selected', 'in_agreement', 'confirmed', 'closed', 'cancelled'].includes(inquiry.status)) {
      await connection.rollback()
      return res.status(409).json({
        message: `Cannot renew an inquiry in status '${inquiry.status}'.`,
      })
    }

    const [sentQuotations] = await connection.execute(
      "SELECT id FROM quotations WHERE inquiry_id = ? AND status = 'sent' LIMIT 1",
      [inquiry.id],
    )
    const nextStatus = sentQuotations[0] ? 'responded' : 'open'
    const prevStatus = inquiry.status

    await connection.execute(
      'UPDATE inquiries SET status = ?, expires_at = DATE_ADD(NOW(), INTERVAL ? DAY) WHERE id = ?',
      [nextStatus, expiresInDays, inquiry.id],
    )

    await recordInquiryEvent(connection, {
      inquiryId: inquiry.id,
      actorId: req.user.id,
      eventType: 'request_renewed',
      fromStatus: prevStatus,
      toStatus: nextStatus,
      note: `Inquiry renewed for ${expiresInDays} days`,
    })

    const [updatedRows] = await connection.execute(
      'SELECT * FROM inquiries WHERE id = ? LIMIT 1',
      [inquiry.id],
    )

    await connection.commit()
    return res.json({
      status: nextStatus,
      inquiry: updatedRows[0],
    })
  } catch (error) {
    await connection.rollback().catch(() => {})
    return next(error)
  } finally {
    connection.release()
  }
}

module.exports = {
  createInquiry,
  createQuotation,
  estimateInquiryPrice,
  getInquiry,
  listInquiries,
  listOpenRequests,
  renewInquiry,
  reviseQuotation,
  updateInquiryStatus,
  updateQuotationStatus,
  withdrawQuotation,
}
