const { pool } = require('../config/database')
const { createNotification } = require('../services/notification.service')
const {
  attachImagesToInquiry,
  serializeRequestImage,
} = require('./requestImage.controller')

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
  const field = req.user.role === 'client' ? 'i.client_id' : 'i.gardener_id'
  try {
    // Lazily mark any open/responded inquiries for this user that have passed expires_at
    await pool.execute(
      `UPDATE inquiries i
       SET i.status = 'expired'
       WHERE ${field} = ?
         AND i.status IN ('open', 'responded')
         AND i.expires_at IS NOT NULL
         AND i.expires_at <= NOW()`,
      [req.user.id],
    )

    const [inquiries] = await pool.execute(
      `SELECT i.id, i.request_type, i.client_id, i.gardener_id, i.service_id, i.category_id,
              i.subject, i.description, i.ai_summary, i.requested_date, i.location,
              i.status, i.expires_at, i.created_at, i.updated_at,
              s.title AS service_title,
              sc.name AS category_name,
              u.first_name AS client_first_name, u.last_name AS client_last_name,
              gp.business_name
       FROM inquiries i
       LEFT JOIN services s ON s.id = i.service_id
       LEFT JOIN service_categories sc ON sc.id = COALESCE(i.category_id, s.category_id)
       JOIN users u ON u.id = i.client_id
       LEFT JOIN gardener_profiles gp ON gp.user_id = i.gardener_id
       WHERE ${field} = ?
       ORDER BY i.updated_at DESC`,
      [req.user.id],
    )
    return res.json({ inquiries })
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
              i.status, i.expires_at, i.created_at, i.updated_at,
              CASE WHEN i.expires_at IS NOT NULL AND i.expires_at <= NOW() THEN 1 ELSE 0 END AS is_expired,
              s.title AS service_title,
              sc.name AS category_name,
              u.first_name AS client_first_name, u.last_name AS client_last_name,
              gp.business_name
       FROM inquiries i
       LEFT JOIN services s ON s.id = i.service_id
       LEFT JOIN service_categories sc ON sc.id = COALESCE(i.category_id, s.category_id)
       JOIN users u ON u.id = i.client_id
       LEFT JOIN gardener_profiles gp ON gp.user_id = i.gardener_id
       WHERE i.id = ?
       LIMIT 1`,
      [inquiryId],
    )
    const inquiry = inquiries[0]
    if (!inquiry) {
      return res.status(404).json({ message: 'Inquiry was not found.' })
    }

    const isOwnerOrTargeted = inquiry.client_id === req.user.id || inquiry.gardener_id === req.user.id
    const isAdmin = req.user.role === 'administrator'

    if (!isOwnerOrTargeted && !isAdmin) {
      return res.status(404).json({ message: 'Inquiry was not found.' })
    }

    if (
      (inquiry.status === 'open' || inquiry.status === 'responded')
      && Number(inquiry.is_expired) === 1
    ) {
      await checkAndPersistLazyExpiry(pool, inquiry, req.user.id)
    }

    const [quotations] = await pool.execute(
      `SELECT q.id, q.inquiry_id, q.gardener_id, q.amount, q.details,
              q.availability_start, q.availability_end, q.status, q.valid_until,
              q.response_type, q.proposed_changes, q.revision_number, q.locked_at,
              q.created_at, q.updated_at,
              COALESCE(gp.business_name, CONCAT(gu.first_name, ' ', gu.last_name)) AS gardener_name
       FROM quotations q
       JOIN users gu ON gu.id = q.gardener_id
       LEFT JOIN gardener_profiles gp ON gp.user_id = q.gardener_id
       WHERE q.inquiry_id = ?
       ORDER BY q.created_at DESC, q.id DESC`,
      [inquiry.id],
    )

    if (quotations.length > 0) {
      const qIds = quotations.map((q) => q.id)
      const placeholders = qIds.map(() => '?').join(', ')
      const [revisions] = await pool.execute(
        `SELECT id, quotation_id, revision_number, response_type, amount, details,
                proposed_changes, availability_start, availability_end, valid_until, created_at
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
      for (const q of quotations) {
        q.revisions = byQuotation.get(q.id) || []
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

    delete inquiry.is_expired
    return res.json({
      inquiry,
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

async function createInquiry(req, res, next) {
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

  if (!serviceId && !gardenerIdParam) {
    return res.status(400).json({ message: 'A valid service or gardener is required for a direct inquiry.' })
  }
  if (rawServiceId !== undefined && rawServiceId !== null && String(rawServiceId).trim() !== '' && !serviceId) {
    return res.status(400).json({ message: 'A valid service is required.' })
  }
  if (rawGardenerId !== undefined && rawGardenerId !== null && String(rawGardenerId).trim() !== '' && !gardenerIdParam) {
    return res.status(400).json({ message: 'A valid gardener ID is required.' })
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

  let expiresInDays = null
  if (rawExpiresInDays !== undefined && rawExpiresInDays !== null && String(rawExpiresInDays).trim() !== '') {
    expiresInDays = parsePositiveInt(rawExpiresInDays)
    if (!expiresInDays || expiresInDays > 90) {
      return res.status(400).json({ message: 'Expiration period must be between 1 and 90 days.' })
    }
  }

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()

    let resolvedGardenerId = gardenerIdParam
    let resolvedCategoryId = categoryIdParam

    if (serviceId) {
      const [services] = await connection.execute(
        `SELECT s.id, s.gardener_id, s.category_id
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
      resolvedGardenerId = services[0].gardener_id
      resolvedCategoryId = resolvedCategoryId || services[0].category_id
    } else {
      const [gardeners] = await connection.execute(
        `SELECT u.id
         FROM users u
         JOIN gardener_profiles gp ON gp.user_id = u.id AND gp.is_approved = TRUE
         WHERE u.id = ? AND u.role = 'gardener' AND u.is_active = TRUE
         LIMIT 1
         FOR UPDATE`,
        [resolvedGardenerId],
      )
      if (!gardeners[0]) {
        await connection.rollback()
        return res.status(404).json({ message: 'Selected gardener is unavailable or not approved.' })
      }
    }

    if (resolvedCategoryId) {
      const [cats] = await connection.execute(
        'SELECT id FROM service_categories WHERE id = ? AND is_active = TRUE LIMIT 1',
        [resolvedCategoryId],
      )
      if (!cats[0]) {
        await connection.rollback()
        return res.status(400).json({ message: 'Selected service category is unavailable.' })
      }
    }

    const expiresSql = expiresInDays ? 'DATE_ADD(NOW(), INTERVAL ? DAY)' : 'NULL'
    const insertParams = [
      req.user.id,
      resolvedGardenerId,
      serviceId,
      resolvedCategoryId,
      subject,
      description,
      aiSummary,
      requestedDate,
      location,
      ...(expiresInDays ? [expiresInDays] : []),
    ]

    const [result] = await connection.execute(
      `INSERT INTO inquiries
        (request_type, client_id, gardener_id, service_id, category_id, subject, description, ai_summary, requested_date, location, expires_at)
       VALUES ('direct', ?, ?, ?, ?, ?, ?, ?, ?, ?, ${expiresSql})`,
      insertParams,
    )
    const inquiryId = result.insertId

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
      note: `Direct inquiry created${attachedImageIds.length ? ` with ${attachedImageIds.length} photo(s)` : ''}`,
    })

    await createNotification({
      userId: resolvedGardenerId,
      type: 'new_inquiry',
      title: 'New service inquiry',
      message: `A client sent a direct inquiry: ${subject}`,
      entityType: 'inquiry',
      entityId: inquiryId,
      connection,
    })

    const [createdInquiryRows] = await connection.execute(
      'SELECT * FROM inquiries WHERE id = ? LIMIT 1',
      [inquiryId],
    )
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
      request_type: 'direct',
      gardener_id: resolvedGardenerId,
      status: 'open',
      attachedImageIds,
      inquiry: createdInquiryRows[0],
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
  const amount = (rawAmount === '' || rawAmount === null || rawAmount === undefined) ? null : Number(rawAmount)
  const details = text(req.body?.details)
  const proposedChanges = text(req.body?.proposedChanges ?? req.body?.proposed_changes) || null
  const availabilityStart = text(req.body?.availabilityStart ?? req.body?.availability_start) || null
  const availabilityEnd = text(req.body?.availabilityEnd ?? req.body?.availability_end) || null
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

    const [result] = await connection.execute(
      `INSERT INTO quotations
        (inquiry_id, gardener_id, amount, details, availability_start, availability_end,
         status, valid_until, response_type, proposed_changes, revision_number)
       VALUES (?, ?, ?, ?, ?, ?, 'sent', ?, ?, ?, 1)`,
      [
        inquiryId,
        req.user.id,
        amount,
        details,
        availabilityStart,
        availabilityEnd,
        validUntil,
        responseType,
        proposedChanges,
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
      note: `Gardener submitted response (${responseType}) v1`,
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
  const amount = (rawAmount === '' || rawAmount === null || rawAmount === undefined) ? null : Number(rawAmount)
  const details = text(req.body?.details)
  const proposedChanges = text(req.body?.proposedChanges ?? req.body?.proposed_changes) || null
  const availabilityStart = text(req.body?.availabilityStart ?? req.body?.availability_start) || null
  const availabilityEnd = text(req.body?.availabilityEnd ?? req.body?.availability_end) || null
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
        (quotation_id, revision_number, response_type, amount, details, proposed_changes,
         availability_start, availability_end, valid_until)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        current.id,
        current.revision_number,
        current.response_type,
        current.amount,
        current.details,
        current.proposed_changes,
        current.availability_start,
        current.availability_end,
        current.valid_until,
      ],
    )

    const nextRevision = Number(current.revision_number) + 1
    await connection.execute(
      `UPDATE quotations
       SET amount = ?,
           details = ?,
           availability_start = ?,
           availability_end = ?,
           valid_until = ?,
           response_type = ?,
           proposed_changes = ?,
           revision_number = ?
       WHERE id = ?`,
      [
        amount,
        details,
        availabilityStart,
        availabilityEnd,
        validUntil,
        responseType,
        proposedChanges,
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
      note: `Quotation revised to v${nextRevision} (${responseType})`,
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
      `SELECT id, client_id, gardener_id, status, subject,
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

    if (quotation.status !== 'sent') {
      await connection.rollback()
      return res.status(409).json({
        message: `Quotation is already ${quotation.status} and cannot be ${status}.`,
      })
    }

    if (status === 'accepted') {
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
      const nextInquiryStatus = inquiry.status === 'in_agreement' ? 'in_agreement' : 'provider_selected'
      await connection.execute(
        'UPDATE inquiries SET status = ?, gardener_id = COALESCE(gardener_id, ?) WHERE id = ?',
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
      await connection.execute(
        "UPDATE quotations SET status = 'declined' WHERE id = ?",
        [quotation.id],
      )

      await recordInquiryEvent(connection, {
        inquiryId: inquiry.id,
        quotationId: quotation.id,
        actorId: req.user.id,
        eventType: 'quotation_declined',
        fromStatus: 'sent',
        toStatus: 'declined',
        note: `Client declined quotation #${quotation.id}`,
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
      inquiryStatus: status === 'accepted' ? 'provider_selected' : inquiry.status,
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

module.exports = {
  createInquiry,
  createQuotation,
  getInquiry,
  listInquiries,
  reviseQuotation,
  updateInquiryStatus,
  updateQuotationStatus,
  withdrawQuotation,
}
