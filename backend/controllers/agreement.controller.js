const { pool } = require('../config/database')
const { createNotification } = require('../services/notification.service')

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function parsePositiveInt(value) {
  const num = Number(value)
  return Number.isInteger(num) && num > 0 ? num : null
}

function normalizeDateTime(value) {
  const raw = text(value)
  if (!raw) return null
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) {
    return `${raw.replace('T', ' ')}:00`
  }
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}$/.test(raw)) {
    return raw.replace('T', ' ')
  }
  return null
}

function validateAgreementPayload(body) {
  const scopeOfWork = text(body.scopeOfWork ?? body.scope_of_work)
  const rawAmount = body.amount
  const amount = rawAmount === '' || rawAmount === null || rawAmount === undefined ? NaN : Number(rawAmount)
  const priceBasis = text(body.priceBasis ?? body.price_basis) || null
  const scheduledStart = normalizeDateTime(body.scheduledStart ?? body.scheduled_start)
  const scheduledEnd = normalizeDateTime(body.scheduledEnd ?? body.scheduled_end)
  const location = text(body.location)
  const conditions = text(body.conditions) || null

  if (!scopeOfWork || scopeOfWork.length > 5000) {
    return { error: 'A scope of work between 1 and 5000 characters is required.' }
  }
  if (!Number.isFinite(amount) || amount < 0) {
    return { error: 'A valid non-negative agreed price is required.' }
  }
  if (priceBasis && priceBasis.length > 100) {
    return { error: 'Price basis must be 100 characters or fewer.' }
  }
  if (!scheduledStart || !scheduledEnd) {
    return { error: 'Valid scheduled start and end date/times are required.' }
  }
  if (new Date(scheduledEnd.replace(' ', 'T')) <= new Date(scheduledStart.replace(' ', 'T'))) {
    return { error: 'The scheduled end must be after the scheduled start.' }
  }
  if (!location || location.length > 255) {
    return { error: 'A valid service location between 1 and 255 characters is required.' }
  }
  if (conditions && conditions.length > 5000) {
    return { error: 'Agreement conditions must be 5000 characters or fewer.' }
  }

  return {
    value: {
      scopeOfWork,
      amount: Number(amount.toFixed(2)),
      priceBasis,
      scheduledStart,
      scheduledEnd,
      location,
      conditions,
    },
  }
}

async function recordRequestEvent(connection, {
  inquiryId,
  quotationId = null,
  agreementId = null,
  actorId,
  eventType,
  fromStatus = null,
  toStatus = null,
  note = null,
}) {
  await connection.execute(
    `INSERT INTO request_events
      (inquiry_id, quotation_id, agreement_id, actor_id, event_type, from_status, to_status, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [inquiryId, quotationId, agreementId, actorId, eventType, fromStatus, toStatus, note ? note.slice(0, 255) : null],
  )
}

async function hasGardenerScheduleConflict(connection, gardenerId, scheduledStart, scheduledEnd) {
  const [conflicts] = await connection.execute(
    `SELECT id FROM bookings
     WHERE gardener_id = ?
       AND status IN ('pending', 'accepted', 'in_progress')
       AND scheduled_start < ?
       AND scheduled_end > ?
     LIMIT 1
     FOR UPDATE`,
    [gardenerId, scheduledEnd, scheduledStart],
  )
  return Boolean(conflicts[0])
}

async function fetchAgreementById(connection, agreementId) {
  const [rows] = await connection.execute(
    `SELECT a.*,
            b.id AS booking_id,
            b.status AS booking_status,
            CONCAT(c.first_name, ' ', c.last_name) AS client_name,
            COALESCE(gp.business_name, CONCAT(g.first_name, ' ', g.last_name)) AS gardener_name
     FROM agreements a
     JOIN users c ON c.id = a.client_id
     JOIN users g ON g.id = a.gardener_id
     LEFT JOIN gardener_profiles gp ON gp.user_id = a.gardener_id
     LEFT JOIN bookings b ON b.agreement_id = a.id
     WHERE a.id = ?
     LIMIT 1`,
    [agreementId],
  )
  return rows[0] || null
}

async function listInquiryAgreements(req, res, next) {
  const inquiryId = parsePositiveInt(req.params.inquiryId)
  if (!inquiryId) {
    return res.status(400).json({ message: 'A valid inquiry ID is required.' })
  }

  try {
    const [inquiries] = await pool.execute(
      'SELECT id, client_id, gardener_id, status FROM inquiries WHERE id = ? LIMIT 1',
      [inquiryId],
    )
    const inquiry = inquiries[0]
    if (!inquiry) {
      return res.status(404).json({ message: 'Service request was not found.' })
    }

    const [agreements] = await pool.execute(
      `SELECT a.*,
              b.id AS booking_id,
              b.status AS booking_status,
              CONCAT(c.first_name, ' ', c.last_name) AS client_name,
              COALESCE(gp.business_name, CONCAT(g.first_name, ' ', g.last_name)) AS gardener_name
       FROM agreements a
       JOIN users c ON c.id = a.client_id
       JOIN users g ON g.id = a.gardener_id
       LEFT JOIN gardener_profiles gp ON gp.user_id = a.gardener_id
       LEFT JOIN bookings b ON b.agreement_id = a.id
       WHERE a.inquiry_id = ?
       ORDER BY a.version DESC, a.id DESC`,
      [inquiryId],
    )

    const isAdmin = req.user.role === 'administrator'
    const isInquiryClient = req.user.id === inquiry.client_id
    const isInquiryGardener = inquiry.gardener_id && req.user.id === inquiry.gardener_id
    const isAgreementParty = agreements.some(
      (a) => a.client_id === req.user.id || a.gardener_id === req.user.id,
    )

    if (!isAdmin && !isInquiryClient && !isInquiryGardener && !isAgreementParty) {
      return res.status(403).json({ message: 'You do not have permission to view agreements for this request.' })
    }

    // Filter agreements if a gardener only has permission for their own agreement record
    const visibleAgreements = (isAdmin || isInquiryClient)
      ? agreements
      : agreements.filter((a) => a.gardener_id === req.user.id)

    const activeAgreement = visibleAgreements.find(
      (a) => a.status === 'proposed' || a.status === 'agreed',
    ) || null

    const [events] = await pool.execute(
      `SELECT id, inquiry_id, quotation_id, agreement_id, actor_id, event_type, from_status, to_status, note, created_at
       FROM request_events
       WHERE inquiry_id = ?
       ORDER BY created_at DESC, id DESC`,
      [inquiryId],
    )

    return res.json({
      activeAgreement,
      agreements: visibleAgreements,
      events,
    })
  } catch (error) {
    return next(error)
  }
}

async function getAgreement(req, res, next) {
  const agreementId = parsePositiveInt(req.params.agreementId)
  if (!agreementId) {
    return res.status(400).json({ message: 'A valid agreement ID is required.' })
  }

  try {
    const agreement = await fetchAgreementById(pool, agreementId)
    if (!agreement) {
      return res.status(404).json({ message: 'Agreement was not found.' })
    }

    if (
      req.user.role !== 'administrator'
      && req.user.id !== agreement.client_id
      && req.user.id !== agreement.gardener_id
    ) {
      return res.status(403).json({ message: 'You do not have permission to view this agreement.' })
    }

    const [history] = await pool.execute(
      `SELECT id, inquiry_id, quotation_id, client_id, gardener_id, previous_agreement_id,
              version, scope_of_work, amount, price_basis, scheduled_start, scheduled_end,
              location, conditions, proposed_by, client_approved_at, gardener_approved_at,
              status, created_at, updated_at
       FROM agreements
       WHERE inquiry_id = ?
       ORDER BY version DESC, id DESC`,
      [agreement.inquiry_id],
    )

    return res.json({
      agreement,
      history,
    })
  } catch (error) {
    return next(error)
  }
}

async function proposeAgreement(req, res, next) {
  const inquiryId = parsePositiveInt(req.params.inquiryId ?? req.body?.inquiryId ?? req.body?.inquiry_id)
  if (!inquiryId) {
    return res.status(400).json({ message: 'A valid service request ID is required.' })
  }

  const requestedQuotationId = req.body?.quotationId ?? req.body?.quotation_id
  const quotationIdParam = (requestedQuotationId !== undefined && requestedQuotationId !== null && String(requestedQuotationId).trim() !== '')
    ? parsePositiveInt(requestedQuotationId)
    : null

  const validated = validateAgreementPayload(req.body || {})
  if (validated.error) {
    return res.status(400).json({ message: validated.error })
  }
  const {
    scopeOfWork,
    amount,
    priceBasis,
    scheduledStart,
    scheduledEnd,
    location,
    conditions,
  } = validated.value

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()

    // 1. Always lock parent inquiry FIRST to serialize concurrent operations on the same inquiry
    const [inquiries] = await connection.execute(
      `SELECT id, request_type, client_id, gardener_id, service_id, status,
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
      return res.status(404).json({ message: 'Service request was not found.' })
    }

    if (['closed', 'cancelled', 'confirmed', 'expired'].includes(inquiry.status)) {
      await connection.rollback()
      return res.status(409).json({
        message: `Cannot propose an agreement because this request is ${inquiry.status}.`,
      })
    }

    if (
      (inquiry.status === 'open' || inquiry.status === 'responded')
      && Number(inquiry.is_expired) === 1
    ) {
      await connection.execute("UPDATE inquiries SET status = 'expired' WHERE id = ?", [inquiry.id])
      await recordRequestEvent(connection, {
        inquiryId: inquiry.id,
        actorId: req.user.id,
        eventType: 'request_expired',
        fromStatus: inquiry.status,
        toStatus: 'expired',
        note: 'Request expired before agreement proposal',
      })
      await connection.commit()
      return res.status(409).json({
        message: 'This service request has expired and can no longer start a new agreement.',
      })
    }

    // 2. Determinequotation and gardener for this agreement
    let resolvedQuotation = null
    if (quotationIdParam) {
      const [qRows] = await connection.execute(
        'SELECT * FROM quotations WHERE id = ? AND inquiry_id = ? LIMIT 1 FOR UPDATE',
        [quotationIdParam, inquiry.id],
      )
      resolvedQuotation = qRows[0] || null
      if (!resolvedQuotation) {
        await connection.rollback()
        return res.status(404).json({ message: 'The specified quotation was not found for this request.' })
      }
      if (['declined', 'withdrawn', 'expired'].includes(resolvedQuotation.status)) {
        await connection.rollback()
        return res.status(409).json({ message: 'Cannot create an agreement from a declined, withdrawn, or expired offer.' })
      }
    } else {
      const [acceptedQuotes] = await connection.execute(
        "SELECT * FROM quotations WHERE inquiry_id = ? AND status = 'accepted' ORDER BY id DESC LIMIT 1 FOR UPDATE",
        [inquiry.id],
      )
      resolvedQuotation = acceptedQuotes[0] || null
    }

    const gardenerId = inquiry.gardener_id || (resolvedQuotation ? resolvedQuotation.gardener_id : null)
    if (!gardenerId) {
      await connection.rollback()
      return res.status(409).json({
        message: 'A service provider must be selected or have an accepted offer before proposing an agreement.',
      })
    }

    const clientId = inquiry.client_id
    if (req.user.id !== clientId && req.user.id !== gardenerId) {
      await connection.rollback()
      return res.status(403).json({
        message: 'Only the client and the selected gardener for this request can propose an agreement.',
      })
    }

    // 3. Ensure no active (proposed or agreed) agreement already exists for this inquiry
    const [existingActive] = await connection.execute(
      `SELECT id, version, status FROM agreements
       WHERE inquiry_id = ? AND status IN ('proposed', 'agreed')
       LIMIT 1
       FOR UPDATE`,
      [inquiry.id],
    )
    if (existingActive[0]) {
      await connection.rollback()
      return res.status(409).json({
        message: 'An active agreement already exists for this request. Edit or approve the current version instead.',
      })
    }

    // 4. Check gardener schedule conflicts
    if (await hasGardenerScheduleConflict(connection, gardenerId, scheduledStart, scheduledEnd)) {
      await connection.rollback()
      return res.status(409).json({
        message: 'The gardener already has a booking during that scheduled time.',
      })
    }

    // 5. Find highest previous version (in case a prior agreement was cancelled)
    const [[maxVerRow]] = await connection.execute(
      'SELECT COALESCE(MAX(version), 0) AS max_version FROM agreements WHERE inquiry_id = ? FOR UPDATE',
      [inquiry.id],
    )
    const nextVersion = Number(maxVerRow.max_version) + 1

    // Both client_approved_at and gardener_approved_at start as NULL so both parties
    // must explicitly approve the same agreement version before a booking is confirmed.
    const [ins] = await connection.execute(
      `INSERT INTO agreements
        (inquiry_id, quotation_id, client_id, gardener_id, previous_agreement_id, version,
         scope_of_work, amount, price_basis, scheduled_start, scheduled_end, location,
         conditions, proposed_by, client_approved_at, gardener_approved_at, status)
       VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 'proposed')`,
      [
        inquiry.id,
        resolvedQuotation ? resolvedQuotation.id : null,
        clientId,
        gardenerId,
        nextVersion,
        scopeOfWork,
        amount,
        priceBasis,
        scheduledStart,
        scheduledEnd,
        location,
        conditions,
        req.user.id,
      ],
    )

    if (resolvedQuotation && resolvedQuotation.status === 'sent' && req.user.id === clientId) {
      await connection.execute(
        "UPDATE quotations SET status = 'accepted', locked_at = COALESCE(locked_at, NOW()) WHERE id = ?",
        [resolvedQuotation.id],
      )
    } else if (resolvedQuotation && resolvedQuotation.status === 'accepted' && !resolvedQuotation.locked_at) {
      await connection.execute(
        'UPDATE quotations SET locked_at = NOW() WHERE id = ?',
        [resolvedQuotation.id],
      )
    }

    const prevStatus = inquiry.status
    await connection.execute(
      "UPDATE inquiries SET status = 'in_agreement', gardener_id = ? WHERE id = ?",
      [gardenerId, inquiry.id],
    )

    await recordRequestEvent(connection, {
      inquiryId: inquiry.id,
      quotationId: resolvedQuotation ? resolvedQuotation.id : null,
      agreementId: ins.insertId,
      actorId: req.user.id,
      eventType: 'agreement_proposed',
      fromStatus: prevStatus,
      toStatus: 'in_agreement',
      note: `Proposed agreement v${nextVersion}`,
    })

    const recipientId = req.user.id === clientId ? gardenerId : clientId
    await createNotification({
      userId: recipientId,
      type: 'agreement_proposed',
      title: 'Service agreement proposed',
      message: `Agreement v${nextVersion} has been proposed for review and approval.`,
      entityType: 'inquiry',
      entityId: inquiry.id,
      connection,
    })

    const created = await fetchAgreementById(connection, ins.insertId)
    await connection.commit()

    return res.status(201).json({
      agreement: created,
      booking: null,
      confirmed: false,
    })
  } catch (error) {
    await connection.rollback().catch(() => {})
    if (error && error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        message: 'An active agreement already exists for this request.',
      })
    }
    return next(error)
  } finally {
    connection.release()
  }
}

async function proposeDirectServiceAgreement(req, res, next) {
  if (req.user.role !== 'client') {
    return res.status(403).json({ message: 'Only clients can request a service arrangement.' })
  }

  const serviceId = parsePositiveInt(req.params.serviceId ?? req.body?.serviceId ?? req.body?.service_id)
  if (!serviceId) {
    return res.status(400).json({ message: 'A valid service ID is required.' })
  }

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()

    const [services] = await connection.execute(
      `SELECT s.id, s.gardener_id, s.category_id, s.title, s.description, s.indicative_price, s.price_unit
       FROM services s
       JOIN users u ON u.id = s.gardener_id AND u.is_active = TRUE
       JOIN gardener_profiles gp ON gp.user_id = u.id AND gp.is_approved = TRUE
       JOIN service_categories c ON c.id = s.category_id AND c.is_active = TRUE
       WHERE s.id = ? AND s.is_active = TRUE AND s.indicative_price IS NOT NULL
       LIMIT 1
       FOR UPDATE`,
      [serviceId],
    )
    const service = services[0]
    if (!service) {
      await connection.rollback()
      return res.status(409).json({
        message: 'This service is not eligible for direct arrangement. Please send an inquiry instead.',
      })
    }

    const payloadWithDefaults = {
      scopeOfWork: text(req.body?.scopeOfWork ?? req.body?.scope_of_work ?? req.body?.notes) || `${service.title}: ${service.description}`,
      amount: req.body?.amount !== undefined && req.body?.amount !== '' ? req.body.amount : service.indicative_price,
      priceBasis: text(req.body?.priceBasis ?? req.body?.price_basis) || service.price_unit || null,
      scheduledStart: req.body?.scheduledStart ?? req.body?.scheduled_start,
      scheduledEnd: req.body?.scheduledEnd ?? req.body?.scheduled_end,
      location: req.body?.location,
      conditions: req.body?.conditions ?? req.body?.notes ?? null,
    }

    const validated = validateAgreementPayload(payloadWithDefaults)
    if (validated.error) {
      await connection.rollback()
      return res.status(400).json({ message: validated.error })
    }
    const {
      scopeOfWork,
      amount,
      priceBasis,
      scheduledStart,
      scheduledEnd,
      location,
      conditions,
    } = validated.value

    if (await hasGardenerScheduleConflict(connection, service.gardener_id, scheduledStart, scheduledEnd)) {
      await connection.rollback()
      return res.status(409).json({
        message: 'The gardener already has a booking during that time.',
      })
    }

    const requestedDate = scheduledStart.slice(0, 10)
    const [inqIns] = await connection.execute(
      `INSERT INTO inquiries
        (request_type, client_id, gardener_id, service_id, category_id, subject, description, requested_date, location, status)
       VALUES ('direct', ?, ?, ?, ?, ?, ?, ?, ?, 'in_agreement')`,
      [
        req.user.id,
        service.gardener_id,
        service.id,
        service.category_id,
        `Service arrangement: ${service.title}`.slice(0, 200),
        scopeOfWork,
        requestedDate,
        location,
      ],
    )
    const inquiryId = inqIns.insertId

    const [agIns] = await connection.execute(
      `INSERT INTO agreements
        (inquiry_id, quotation_id, client_id, gardener_id, previous_agreement_id, version,
         scope_of_work, amount, price_basis, scheduled_start, scheduled_end, location,
         conditions, proposed_by, client_approved_at, gardener_approved_at, status)
       VALUES (?, NULL, ?, ?, NULL, 1, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 'proposed')`,
      [
        inquiryId,
        req.user.id,
        service.gardener_id,
        scopeOfWork,
        amount,
        priceBasis,
        scheduledStart,
        scheduledEnd,
        location,
        conditions,
        req.user.id,
      ],
    )

    await recordRequestEvent(connection, {
      inquiryId,
      agreementId: agIns.insertId,
      actorId: req.user.id,
      eventType: 'agreement_proposed',
      fromStatus: 'open',
      toStatus: 'in_agreement',
      note: 'Direct priced-service agreement v1 proposed',
    })

    await createNotification({
      userId: service.gardener_id,
      type: 'agreement_proposed',
      title: 'New service agreement proposed',
      message: `A client proposed an agreement for ${service.title}. Both parties must approve before the booking is confirmed.`,
      entityType: 'inquiry',
      entityId: inquiryId,
      connection,
    })

    const created = await fetchAgreementById(connection, agIns.insertId)
    await connection.commit()

    return res.status(201).json({
      inquiryId,
      agreement: created,
      booking: null,
      confirmed: false,
    })
  } catch (error) {
    await connection.rollback().catch(() => {})
    return next(error)
  } finally {
    connection.release()
  }
}

async function editAgreement(req, res, next) {
  const agreementId = parsePositiveInt(req.params.agreementId)
  if (!agreementId) {
    return res.status(400).json({ message: 'A valid agreement ID is required.' })
  }

  const expectedVersionRaw = req.body?.expectedVersion ?? req.body?.version
  const expectedVersion = (expectedVersionRaw !== undefined && expectedVersionRaw !== null && String(expectedVersionRaw).trim() !== '')
    ? parsePositiveInt(expectedVersionRaw)
    : null
  if (expectedVersionRaw !== undefined && expectedVersionRaw !== null && String(expectedVersionRaw).trim() !== '' && !expectedVersion) {
    return res.status(400).json({ message: 'Expected version must be a positive integer.' })
  }

  const validated = validateAgreementPayload(req.body || {})
  if (validated.error) {
    return res.status(400).json({ message: validated.error })
  }
  const {
    scopeOfWork,
    amount,
    priceBasis,
    scheduledStart,
    scheduledEnd,
    location,
    conditions,
  } = validated.value

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()

    const [lookup] = await connection.execute(
      'SELECT id, inquiry_id FROM agreements WHERE id = ? LIMIT 1',
      [agreementId],
    )
    if (!lookup[0]) {
      await connection.rollback()
      return res.status(404).json({ message: 'Agreement was not found.' })
    }

    // 1. Lock parent inquiry first for deadlock-free serialization
    const [inquiries] = await connection.execute(
      'SELECT id, status FROM inquiries WHERE id = ? LIMIT 1 FOR UPDATE',
      [lookup[0].inquiry_id],
    )
    const inquiry = inquiries[0]

    // 2. Lock target agreement row
    const [agRows] = await connection.execute(
      'SELECT * FROM agreements WHERE id = ? LIMIT 1 FOR UPDATE',
      [agreementId],
    )
    const current = agRows[0]

    if (req.user.id !== current.client_id && req.user.id !== current.gardener_id) {
      await connection.rollback()
      return res.status(403).json({
        message: 'Only the client and gardener on this agreement can edit it.',
      })
    }

    if (current.status === 'agreed' || inquiry.status === 'confirmed') {
      await connection.rollback()
      return res.status(409).json({
        message: 'Confirmed agreements are locked and cannot be edited.',
      })
    }

    if (current.status !== 'proposed') {
      await connection.rollback()
      return res.status(409).json({
        message: `Agreement v${current.version} is already ${current.status}. Please edit the latest active version.`,
      })
    }

    if (expectedVersion !== null && current.version !== expectedVersion) {
      await connection.rollback()
      return res.status(409).json({
        message: `Agreement version mismatch: expected v${expectedVersion}, but current is v${current.version}.`,
      })
    }

    if (await hasGardenerScheduleConflict(connection, current.gardener_id, scheduledStart, scheduledEnd)) {
      await connection.rollback()
      return res.status(409).json({
        message: 'The gardener already has a booking during that scheduled time.',
      })
    }

    // 3. Mark current version as 'superseded' (preserving history in agreements)
    await connection.execute(
      "UPDATE agreements SET status = 'superseded' WHERE id = ?",
      [current.id],
    )

    // 4. Insert new version (version + 1) linked via previous_agreement_id,
    //    with BOTH approvals reset to NULL!
    const newVersion = current.version + 1
    const [ins] = await connection.execute(
      `INSERT INTO agreements
        (inquiry_id, quotation_id, client_id, gardener_id, previous_agreement_id, version,
         scope_of_work, amount, price_basis, scheduled_start, scheduled_end, location,
         conditions, proposed_by, client_approved_at, gardener_approved_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 'proposed')`,
      [
        current.inquiry_id,
        current.quotation_id,
        current.client_id,
        current.gardener_id,
        current.id,
        newVersion,
        scopeOfWork,
        amount,
        priceBasis,
        scheduledStart,
        scheduledEnd,
        location,
        conditions,
        req.user.id,
      ],
    )

    await recordRequestEvent(connection, {
      inquiryId: current.inquiry_id,
      quotationId: current.quotation_id,
      agreementId: ins.insertId,
      actorId: req.user.id,
      eventType: 'agreement_revised',
      fromStatus: `v${current.version}`,
      toStatus: `v${newVersion}`,
      note: `Agreement revised from v${current.version} to v${newVersion}; approvals reset`,
    })

    const recipientId = req.user.id === current.client_id ? current.gardener_id : current.client_id
    await createNotification({
      userId: recipientId,
      type: 'agreement_revised',
      title: 'Service agreement updated',
      message: `Agreement was updated to v${newVersion}. Previous approvals were reset; please review and approve v${newVersion}.`,
      entityType: 'inquiry',
      entityId: current.inquiry_id,
      connection,
    })

    const updated = await fetchAgreementById(connection, ins.insertId)
    await connection.commit()

    return res.json({
      agreement: updated,
      previousAgreementId: current.id,
      booking: null,
      confirmed: false,
    })
  } catch (error) {
    await connection.rollback().catch(() => {})
    return next(error)
  } finally {
    connection.release()
  }
}

async function approveAgreement(req, res, next) {
  const agreementId = parsePositiveInt(req.params.agreementId)
  if (!agreementId) {
    return res.status(400).json({ message: 'A valid agreement ID is required.' })
  }

  const requestedVersion = parsePositiveInt(req.body?.version ?? req.body?.expectedVersion)
  if (!requestedVersion) {
    return res.status(400).json({
      message: 'The agreement version number being approved is required.',
    })
  }

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()

    const [lookup] = await connection.execute(
      'SELECT id, inquiry_id FROM agreements WHERE id = ? LIMIT 1',
      [agreementId],
    )
    if (!lookup[0]) {
      await connection.rollback()
      return res.status(404).json({ message: 'Agreement was not found.' })
    }

    // 1. Lock parent inquiry first to serialize concurrent approvals/edits on the same inquiry
    const [inquiries] = await connection.execute(
      'SELECT * FROM inquiries WHERE id = ? LIMIT 1 FOR UPDATE',
      [lookup[0].inquiry_id],
    )
    const inquiry = inquiries[0]

    // 2. Lock the target agreement row AND check latest version for this inquiry
    const [agRows] = await connection.execute(
      'SELECT * FROM agreements WHERE id = ? LIMIT 1 FOR UPDATE',
      [agreementId],
    )
    const agreement = agRows[0]

    const [latestRows] = await connection.execute(
      'SELECT id, version, status FROM agreements WHERE inquiry_id = ? ORDER BY version DESC, id DESC LIMIT 1 FOR UPDATE',
      [inquiry.id],
    )
    const latest = latestRows[0]

    if (req.user.id !== agreement.client_id && req.user.id !== agreement.gardener_id) {
      await connection.rollback()
      return res.status(403).json({
        message: 'Only the client and gardener on this agreement can approve it.',
      })
    }

    // 3. Reject stale version approvals
    if (
      agreement.status === 'superseded'
      || agreement.version !== requestedVersion
      || (latest && (latest.id !== agreement.id || latest.version !== requestedVersion))
    ) {
      await connection.rollback()
      return res.status(409).json({
        message: `Stale agreement version: v${requestedVersion} is no longer the current active version (latest is v${latest ? latest.version : agreement.version}).`,
      })
    }

    if (agreement.status === 'cancelled' || ['closed', 'cancelled'].includes(inquiry.status)) {
      await connection.rollback()
      return res.status(409).json({
        message: 'This agreement or service request has been cancelled or closed and cannot be approved.',
      })
    }

    const isClient = req.user.id === agreement.client_id
    const myApprovalField = isClient ? 'client_approved_at' : 'gardener_approved_at'
    const otherApprovalValue = isClient ? agreement.gardener_approved_at : agreement.client_approved_at

    // 4. Reject duplicate approval by the same party or on an already confirmed agreement
    if (agreement[myApprovalField] !== null || agreement.status === 'agreed') {
      await connection.rollback()
      return res.status(409).json({
        message: `You have already approved agreement v${agreement.version}.`,
      })
    }

    // 5A. First party approval -> record timestamp only, keep status = 'proposed', NO booking created
    if (otherApprovalValue === null) {
      await connection.execute(
        `UPDATE agreements SET ${myApprovalField} = NOW() WHERE id = ? AND version = ? AND status = 'proposed'`,
        [agreement.id, requestedVersion],
      )

      await recordRequestEvent(connection, {
        inquiryId: inquiry.id,
        quotationId: agreement.quotation_id,
        agreementId: agreement.id,
        actorId: req.user.id,
        eventType: 'agreement_approved_partial',
        fromStatus: 'proposed',
        toStatus: 'proposed',
        note: `${isClient ? 'Client' : 'Gardener'} approved agreement v${agreement.version}`,
      })

      const otherPartyId = isClient ? agreement.gardener_id : agreement.client_id
      await createNotification({
        userId: otherPartyId,
        type: 'agreement_approved',
        title: 'Agreement approved by other party',
        message: `The ${isClient ? 'client' : 'gardener'} approved agreement v${agreement.version}. Approve v${agreement.version} to confirm the booking.`,
        entityType: 'inquiry',
        entityId: inquiry.id,
        connection,
      })

      const updated = await fetchAgreementById(connection, agreement.id)
      await connection.commit()

      return res.json({
        agreement: updated,
        booking: null,
        confirmed: false,
      })
    }

    // 5B. Second party approval -> BOTH parties have now approved the SAME version!
    // Check that no booking already exists for this agreement
    const [existingBookings] = await connection.execute(
      'SELECT id FROM bookings WHERE agreement_id = ? LIMIT 1 FOR UPDATE',
      [agreement.id],
    )
    if (existingBookings[0]) {
      await connection.rollback()
      return res.status(409).json({
        message: 'A confirmed booking has already been created for this agreement.',
      })
    }

    // Re-check gardener schedule conflicts inside the transaction before confirming
    if (
      await hasGardenerScheduleConflict(
        connection,
        agreement.gardener_id,
        agreement.scheduled_start,
        agreement.scheduled_end,
      )
    ) {
      await connection.rollback()
      return res.status(409).json({
        message: 'The gardener already has an accepted booking during the agreed schedule.',
      })
    }

    // Mark agreement as 'agreed' with the second party's approval timestamp
    const [updAg] = await connection.execute(
      `UPDATE agreements
       SET ${myApprovalField} = NOW(), status = 'agreed'
       WHERE id = ? AND version = ? AND status = 'proposed'`,
      [agreement.id, requestedVersion],
    )
    if (!updAg.affectedRows) {
      await connection.rollback()
      return res.status(409).json({
        message: 'Agreement could not be confirmed because its state changed concurrently.',
      })
    }

    // Support test fault injection hook to verify atomic transaction rollback on failure
    if (typeof approveAgreement._testBeforeBookingHook === 'function') {
      await approveAgreement._testBeforeBookingHook({ agreementId: agreement.id, inquiryId: inquiry.id })
    }

    const bookingNotes = [
      `Agreed Scope (v${agreement.version}): ${agreement.scope_of_work}`,
      `Agreed Price: PHP ${Number(agreement.amount).toFixed(2)}${agreement.price_basis ? ` (${agreement.price_basis})` : ''}`,
      agreement.conditions ? `Conditions: ${agreement.conditions}` : null,
    ].filter(Boolean).join('\n')

    const [bookingIns] = await connection.execute(
      `INSERT INTO bookings
        (inquiry_id, quotation_id, client_id, gardener_id, service_id,
         scheduled_start, scheduled_end, location, notes, status, agreement_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'accepted', ?)`,
      [
        inquiry.id,
        agreement.quotation_id,
        agreement.client_id,
        agreement.gardener_id,
        inquiry.service_id,
        agreement.scheduled_start,
        agreement.scheduled_end,
        agreement.location,
        bookingNotes,
        agreement.id,
      ],
    )
    const bookingId = bookingIns.insertId

    await connection.execute(
      "UPDATE inquiries SET status = 'confirmed', gardener_id = ? WHERE id = ?",
      [agreement.gardener_id, inquiry.id],
    )

    if (agreement.quotation_id) {
      await connection.execute(
        "UPDATE quotations SET status = 'accepted', locked_at = COALESCE(locked_at, NOW()) WHERE id = ?",
        [agreement.quotation_id],
      )
    }

    // Decline any other open/sent offers on this inquiry
    await connection.execute(
      `UPDATE quotations
       SET status = 'declined'
       WHERE inquiry_id = ?
         AND id <> COALESCE(?, 0)
         AND status IN ('draft', 'sent')`,
      [inquiry.id, agreement.quotation_id],
    )

    await recordRequestEvent(connection, {
      inquiryId: inquiry.id,
      quotationId: agreement.quotation_id,
      agreementId: agreement.id,
      actorId: req.user.id,
      eventType: 'agreement_confirmed',
      fromStatus: 'proposed',
      toStatus: 'agreed',
      note: `Both parties approved agreement v${agreement.version}; booking #${bookingId} confirmed`,
    })

    await createNotification({
      userId: agreement.client_id,
      type: 'booking_confirmed',
      title: 'Service arrangement confirmed',
      message: `Both parties approved agreement v${agreement.version}. Booking #${bookingId} is now confirmed.`,
      entityType: 'booking',
      entityId: bookingId,
      connection,
    })

    await createNotification({
      userId: agreement.gardener_id,
      type: 'booking_confirmed',
      title: 'Service arrangement confirmed',
      message: `Both parties approved agreement v${agreement.version}. Booking #${bookingId} is now confirmed.`,
      entityType: 'booking',
      entityId: bookingId,
      connection,
    })

    const confirmedAgreement = await fetchAgreementById(connection, agreement.id)
    const [bookingRows] = await connection.execute(
      'SELECT * FROM bookings WHERE id = ? LIMIT 1',
      [bookingId],
    )

    await connection.commit()

    return res.json({
      agreement: confirmedAgreement,
      booking: bookingRows[0],
      confirmed: true,
    })
  } catch (error) {
    await connection.rollback().catch(() => {})
    if (error && error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        message: 'A confirmed booking already exists for this agreement.',
      })
    }
    return next(error)
  } finally {
    connection.release()
  }
}

async function cancelAgreement(req, res, next) {
  const agreementId = parsePositiveInt(req.params.agreementId)
  if (!agreementId) {
    return res.status(400).json({ message: 'A valid agreement ID is required.' })
  }

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()

    const [lookup] = await connection.execute(
      'SELECT id, inquiry_id FROM agreements WHERE id = ? LIMIT 1',
      [agreementId],
    )
    if (!lookup[0]) {
      await connection.rollback()
      return res.status(404).json({ message: 'Agreement was not found.' })
    }

    const [inquiries] = await connection.execute(
      'SELECT * FROM inquiries WHERE id = ? LIMIT 1 FOR UPDATE',
      [lookup[0].inquiry_id],
    )
    const inquiry = inquiries[0]

    const [agRows] = await connection.execute(
      'SELECT * FROM agreements WHERE id = ? LIMIT 1 FOR UPDATE',
      [agreementId],
    )
    const agreement = agRows[0]

    if (req.user.id !== agreement.client_id && req.user.id !== agreement.gardener_id) {
      await connection.rollback()
      return res.status(403).json({
        message: 'Only the client and gardener on this agreement can cancel it.',
      })
    }

    if (agreement.status === 'agreed') {
      await connection.rollback()
      return res.status(409).json({
        message: 'This agreement is already confirmed as a booking. Cancel the booking instead.',
      })
    }

    if (agreement.status !== 'proposed') {
      await connection.rollback()
      return res.status(409).json({
        message: `Agreement v${agreement.version} is already ${agreement.status}.`,
      })
    }

    await connection.execute(
      "UPDATE agreements SET status = 'cancelled' WHERE id = ?",
      [agreement.id],
    )

    const [[quoteCount]] = await connection.execute(
      'SELECT COUNT(*) AS total FROM quotations WHERE inquiry_id = ?',
      [inquiry.id],
    )
    const revertedStatus = Number(quoteCount.total) > 0 ? 'responded' : 'open'

    if (inquiry.status === 'in_agreement') {
      await connection.execute(
        'UPDATE inquiries SET status = ? WHERE id = ?',
        [revertedStatus, inquiry.id],
      )
    }

    await recordRequestEvent(connection, {
      inquiryId: inquiry.id,
      quotationId: agreement.quotation_id,
      agreementId: agreement.id,
      actorId: req.user.id,
      eventType: 'agreement_cancelled',
      fromStatus: 'proposed',
      toStatus: 'cancelled',
      note: `Agreement v${agreement.version} cancelled`,
    })

    const recipientId = req.user.id === agreement.client_id ? agreement.gardener_id : agreement.client_id
    await createNotification({
      userId: recipientId,
      type: 'agreement_cancelled',
      title: 'Service agreement cancelled',
      message: `Agreement v${agreement.version} was cancelled.`,
      entityType: 'inquiry',
      entityId: inquiry.id,
      connection,
    })

    const cancelled = await fetchAgreementById(connection, agreement.id)
    await connection.commit()

    return res.json({ agreement: cancelled })
  } catch (error) {
    await connection.rollback().catch(() => {})
    return next(error)
  } finally {
    connection.release()
  }
}

module.exports = {
  approveAgreement,
  cancelAgreement,
  editAgreement,
  getAgreement,
  listInquiryAgreements,
  proposeAgreement,
  proposeDirectServiceAgreement,
}
