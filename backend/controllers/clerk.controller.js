const { pool } = require('../config/database')
const { createNotification } = require('../services/notification.service')
const { formatDateOnly } = require('../utils/userProfile')
const { normalizeTimeOfDay, parseWorkingDays } = require('../utils/scheduling')

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function parsePositiveInt(value) {
  const num = Number(value)
  return Number.isInteger(num) && num > 0 ? num : null
}

async function assertAssignedGardener(clerkId, gardenerId, executor = pool) {
  const [rows] = await executor.execute(
    `SELECT cga.id
     FROM clerk_gardener_assignments cga
     JOIN users g ON g.id = cga.gardener_id AND g.is_active = TRUE
     WHERE cga.clerk_id = ? AND cga.gardener_id = ?
     LIMIT 1`,
    [clerkId, gardenerId],
  )
  return Boolean(rows[0])
}

async function getClerkWorkspace(req, res, next) {
  try {
    const [assignedGardeners] = await pool.execute(
      `SELECT u.id, u.email, u.first_name, u.middle_name, u.last_name, u.phone,
              gp.business_name, gp.service_area, gp.years_of_experience, gp.is_approved,
              gp.working_days, gp.work_start_time, gp.work_end_time,
              gp.max_concurrent_jobs, gp.crew_size, gp.availability_notes,
              cga.id AS assignment_id, cga.notes AS assignment_notes, cga.created_at AS assigned_at
       FROM clerk_gardener_assignments cga
       JOIN users u ON u.id = cga.gardener_id AND u.is_active = TRUE
       JOIN gardener_profiles gp ON gp.user_id = u.id
       WHERE cga.clerk_id = ?
       ORDER BY COALESCE(NULLIF(TRIM(gp.business_name), ''), u.first_name)`,
      [req.user.id],
    )

    if (assignedGardeners.length === 0) {
      return res.json({ gardeners: [], services: [], bookings: [], pendingPayments: [] })
    }

    const gIds = assignedGardeners.map((g) => g.id)
    const placeholders = gIds.map(() => '?').join(', ')

    const [unavailRows] = await pool.execute(
      `SELECT id, gardener_id, start_date, end_date, reason, created_at
       FROM gardener_unavailable_dates
       WHERE gardener_id IN (${placeholders})
       ORDER BY start_date ASC`,
      gIds,
    )
    const unavailByGardener = new Map()
    for (const row of unavailRows) {
      if (!unavailByGardener.has(row.gardener_id)) unavailByGardener.set(row.gardener_id, [])
      unavailByGardener.get(row.gardener_id).push({
        id: row.id,
        start_date: formatDateOnly(row.start_date),
        end_date: formatDateOnly(row.end_date),
        reason: row.reason || null,
      })
    }

    const gardeners = assignedGardeners.map((g) => ({
      ...g,
      display_name: g.business_name || `${g.first_name} ${g.last_name}`.trim(),
      work_start_time: String(g.work_start_time || '08:00:00').slice(0, 5),
      work_end_time: String(g.work_end_time || '17:00:00').slice(0, 5),
      max_concurrent_jobs: Math.max(1, Number(g.max_concurrent_jobs) || 1),
      crew_size: Math.max(1, Number(g.crew_size) || 1, Number(g.max_concurrent_jobs) || 1),
      unavailable_dates: unavailByGardener.get(g.id) || [],
    }))

    const [services] = await pool.execute(
      `SELECT s.id, s.gardener_id, s.category_id, s.title, s.description,
              s.indicative_price, s.price_unit, s.service_area, s.workers_required, s.is_active,
              c.name AS category_name,
              COALESCE(NULLIF(TRIM(gp.business_name), ''), CONCAT(g.first_name, ' ', g.last_name)) AS gardener_name
       FROM services s
       JOIN service_categories c ON c.id = s.category_id
       JOIN users g ON g.id = s.gardener_id
       LEFT JOIN gardener_profiles gp ON gp.user_id = g.id
       WHERE s.gardener_id IN (${placeholders})
       ORDER BY s.created_at DESC`,
      gIds,
    )

    const [bookings] = await pool.execute(
      `SELECT b.id, b.gardener_id, b.client_id, b.service_id, b.scheduled_start, b.scheduled_end,
              b.location, b.status, b.booking_stage, b.payment_status, b.required_deposit_amount,
              b.amount_paid, b.transaction_status,
              COALESCE(a.amount, 0) AS agreed_amount,
              s.title AS service_title,
              COALESCE(s.workers_required, 1) AS workers_required,
              CONCAT(c.first_name, ' ', c.last_name) AS client_name,
              COALESCE(NULLIF(TRIM(gp.business_name), ''), CONCAT(g.first_name, ' ', g.last_name)) AS gardener_name
       FROM bookings b
       LEFT JOIN services s ON s.id = b.service_id
       LEFT JOIN agreements a ON a.id = b.agreement_id
       JOIN users c ON c.id = b.client_id
       JOIN users g ON g.id = b.gardener_id
       LEFT JOIN gardener_profiles gp ON gp.user_id = g.id
       WHERE b.gardener_id IN (${placeholders})
       ORDER BY b.scheduled_start DESC, b.id DESC
       LIMIT 100`,
      gIds,
    )

    const [pendingPayments] = await pool.execute(
      `SELECT p.id, p.transaction_code, p.booking_id, p.payment_type, p.payment_method,
              p.gateway_provider, p.gateway_status,
              p.amount, p.reference_number, p.receipt_path, p.notes, p.status, p.created_at,
              b.gardener_id, b.booking_stage, b.payment_status, b.required_deposit_amount, b.amount_paid,
              COALESCE(a.amount, 0) AS agreed_amount,
              s.title AS service_title,
              CONCAT(c.first_name, ' ', c.last_name) AS client_name,
              COALESCE(NULLIF(TRIM(gp.business_name), ''), CONCAT(g.first_name, ' ', g.last_name)) AS gardener_name
       FROM booking_payments p
       JOIN bookings b ON b.id = p.booking_id
       LEFT JOIN agreements a ON a.id = b.agreement_id
       LEFT JOIN services s ON s.id = b.service_id
       JOIN users c ON c.id = b.client_id
       JOIN users g ON g.id = b.gardener_id
       LEFT JOIN gardener_profiles gp ON gp.user_id = g.id
       WHERE b.gardener_id IN (${placeholders})
       ORDER BY FIELD(p.status, 'pending', 'verified', 'rejected'), p.created_at DESC
       LIMIT 100`,
      gIds,
    )

    return res.json({ gardeners, services, bookings, pendingPayments })
  } catch (error) {
    return next(error)
  }
}

async function updateAssignedGardenerSchedule(req, res, next) {
  const gardenerId = parsePositiveInt(req.params.gardenerId)
  if (!gardenerId) return res.status(400).json({ message: 'A valid gardener ID is required.' })

  try {
    if (!(await assertAssignedGardener(req.user.id, gardenerId))) {
      return res.status(403).json({
        code: 'NOT_ASSIGNED_TO_GARDENER',
        message: 'You are not assigned to manage this gardener.',
      })
    }

    const parsedDays = parseWorkingDays(req.body.workingDays ?? req.body.working_days)
    if (parsedDays.error) return res.status(400).json({ message: parsedDays.error })

    const startObj = normalizeTimeOfDay(req.body.workStartTime ?? req.body.work_start_time, '08:00:00')
    const endObj = normalizeTimeOfDay(req.body.workEndTime ?? req.body.work_end_time, '17:00:00')
    if (startObj.error || endObj.error) return res.status(400).json({ message: startObj.error || endObj.error })
    if (endObj.minutes <= startObj.minutes) {
      return res.status(400).json({ message: 'Work end time must be after work start time.' })
    }

    const maxConcurrentJobs = Number(req.body.maxConcurrentJobs ?? req.body.max_concurrent_jobs ?? 1)
    if (!Number.isInteger(maxConcurrentJobs) || maxConcurrentJobs < 1 || maxConcurrentJobs > 10) {
      return res.status(400).json({ message: 'Maximum simultaneous jobs must be between 1 and 10.' })
    }
    const rawCrew = Number(req.body.crewSize ?? req.body.crew_size ?? maxConcurrentJobs)
    if (!Number.isInteger(rawCrew) || rawCrew < 1 || rawCrew > 50) {
      return res.status(400).json({ message: 'Daily crew size must be between 1 and 50.' })
    }
    const crewSize = Math.max(rawCrew, maxConcurrentJobs)
    const availabilityNotes = text(req.body.availabilityNotes ?? req.body.availability_notes) || null
    if (availabilityNotes && availabilityNotes.length > 255) {
      return res.status(400).json({ message: 'Availability notes must be 255 characters or fewer.' })
    }

    await pool.execute(
      `UPDATE gardener_profiles
       SET working_days = ?, work_start_time = ?, work_end_time = ?, max_concurrent_jobs = ?, crew_size = ?, availability_notes = ?
       WHERE user_id = ?`,
      [parsedDays.serialized, startObj.sqlTime, endObj.sqlTime, maxConcurrentJobs, crewSize, availabilityNotes, gardenerId],
    )

    return res.json({ status: 'ok', workingDays: parsedDays.days, workStartTime: startObj.hhmm, workEndTime: endObj.hhmm, maxConcurrentJobs, crewSize })
  } catch (error) {
    return next(error)
  }
}

async function addAssignedGardenerUnavailableDate(req, res, next) {
  const gardenerId = parsePositiveInt(req.params.gardenerId)
  if (!gardenerId) return res.status(400).json({ message: 'A valid gardener ID is required.' })

  const startDate = formatDateOnly(req.body.startDate ?? req.body.start_date)
  const endDate = formatDateOnly(req.body.endDate ?? req.body.end_date) || startDate
  const reason = text(req.body.reason) || null
  if (!startDate || !endDate || endDate < startDate) {
    return res.status(400).json({ message: 'Valid start and end dates (YYYY-MM-DD, end >= start) are required.' })
  }

  try {
    if (!(await assertAssignedGardener(req.user.id, gardenerId))) {
      return res.status(403).json({ code: 'NOT_ASSIGNED_TO_GARDENER', message: 'You are not assigned to manage this gardener.' })
    }
    const [existingBookings] = await pool.execute(
      `SELECT id FROM bookings
       WHERE gardener_id = ? AND status IN ('pending', 'accepted', 'in_progress')
         AND DATE(scheduled_start) <= ? AND DATE(scheduled_end) >= ?
       LIMIT 1`,
      [gardenerId, endDate, startDate],
    )
    if (existingBookings[0]) {
      return res.status(409).json({
        message: 'This gardener already has an active reservation or booking during those dates.',
      })
    }
    const [ins] = await pool.execute(
      'INSERT INTO gardener_unavailable_dates (gardener_id, start_date, end_date, reason) VALUES (?, ?, ?, ?)',
      [gardenerId, startDate, endDate, reason],
    )
    return res.status(201).json({ id: ins.insertId, unavailableDate: { id: ins.insertId, start_date: startDate, end_date: endDate, reason } })
  } catch (error) {
    return next(error)
  }
}

async function removeAssignedGardenerUnavailableDate(req, res, next) {
  const gardenerId = parsePositiveInt(req.params.gardenerId)
  const blockId = parsePositiveInt(req.params.blockId)
  if (!gardenerId || !blockId) return res.status(400).json({ message: 'Valid gardener and date block IDs are required.' })
  try {
    if (!(await assertAssignedGardener(req.user.id, gardenerId))) {
      return res.status(403).json({ code: 'NOT_ASSIGNED_TO_GARDENER', message: 'You are not assigned to manage this gardener.' })
    }
    const [del] = await pool.execute('DELETE FROM gardener_unavailable_dates WHERE id = ? AND gardener_id = ?', [blockId, gardenerId])
    if (!del.affectedRows) return res.status(404).json({ message: 'Unavailable date block was not found.' })
    return res.status(204).send()
  } catch (error) {
    return next(error)
  }
}

async function createAssignedGardenerService(req, res, next) {
  const gardenerId = parsePositiveInt(req.params.gardenerId)
  if (!gardenerId) return res.status(400).json({ message: 'A valid gardener ID is required.' })

  const title = text(req.body.title)
  const description = text(req.body.description)
  const categoryId = parsePositiveInt(req.body.categoryId)
  const indicativePrice = req.body.indicativePrice === '' || req.body.indicativePrice === null || req.body.indicativePrice === undefined
    ? null
    : Number(req.body.indicativePrice)
  const priceUnit = text(req.body.priceUnit) || null
  const serviceArea = text(req.body.serviceArea) || 'Zamboanga City'
  const workersRequired = req.body.workersRequired === '' || req.body.workersRequired === undefined ? 1 : Number(req.body.workersRequired)

  if (!title || title.length > 150 || !description || !categoryId) {
    return res.status(400).json({ message: 'Title, description, and valid category are required.' })
  }
  if (indicativePrice !== null && (!Number.isFinite(indicativePrice) || indicativePrice < 0)) {
    return res.status(400).json({ message: 'Indicative price must be a positive number.' })
  }
  if (!Number.isInteger(workersRequired) || workersRequired < 1 || workersRequired > 20) {
    return res.status(400).json({ message: 'Workers required must be between 1 and 20.' })
  }

  try {
    if (!(await assertAssignedGardener(req.user.id, gardenerId))) {
      return res.status(403).json({ code: 'NOT_ASSIGNED_TO_GARDENER', message: 'You are not assigned to manage this gardener.' })
    }
    const [ins] = await pool.execute(
      `INSERT INTO services (gardener_id, category_id, title, description, indicative_price, price_unit, service_area, workers_required)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [gardenerId, categoryId, title, description, indicativePrice, priceUnit, serviceArea, workersRequired],
    )
    return res.status(201).json({ id: ins.insertId })
  } catch (error) {
    return next(error)
  }
}

async function toggleAssignedGardenerService(req, res, next) {
  const gardenerId = parsePositiveInt(req.params.gardenerId)
  const serviceId = parsePositiveInt(req.params.serviceId)
  if (!gardenerId || !serviceId) return res.status(400).json({ message: 'Valid gardener and service IDs are required.' })
  const isActive = req.body.isActive === true || req.body.isActive === 'true'

  try {
    if (!(await assertAssignedGardener(req.user.id, gardenerId))) {
      return res.status(403).json({ code: 'NOT_ASSIGNED_TO_GARDENER', message: 'You are not assigned to manage this gardener.' })
    }
    const [upd] = await pool.execute(
      'UPDATE services SET is_active = ? WHERE id = ? AND gardener_id = ?',
      [isActive, serviceId, gardenerId],
    )
    if (!upd.affectedRows) return res.status(404).json({ message: 'Service was not found for this gardener.' })
    return res.json({ status: 'ok', isActive })
  } catch (error) {
    return next(error)
  }
}

async function verifyAssignedGardenerPayment(req, res, next) {
  const gardenerId = parsePositiveInt(req.params.gardenerId)
  const bookingId = parsePositiveInt(req.params.bookingId)
  const paymentId = parsePositiveInt(req.params.paymentId)
  if (!gardenerId || !bookingId || !paymentId) {
    return res.status(400).json({ message: 'Valid gardener, booking, and payment IDs are required.' })
  }

  const decision = text(req.body?.decision ?? req.body?.status).toLowerCase()
  const rejectionReason = text(req.body?.rejectionReason ?? req.body?.rejection_reason) || null
  if (!['verified', 'rejected'].includes(decision)) {
    return res.status(400).json({ message: 'Decision must be verified or rejected.' })
  }
  if (decision === 'rejected' && (!rejectionReason || rejectionReason.length > 500)) {
    return res.status(400).json({ message: 'Please provide a rejection reason (up to 500 characters).' })
  }

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    if (!(await assertAssignedGardener(req.user.id, gardenerId, connection))) {
      await connection.rollback()
      return res.status(403).json({ code: 'NOT_ASSIGNED_TO_GARDENER', message: 'You are not assigned to manage this gardener.' })
    }

    const [bRows] = await connection.execute(
      `SELECT b.id, b.client_id, b.gardener_id, b.status, b.booking_stage, b.payment_status,
              b.required_deposit_amount, b.amount_paid, b.paid_at, b.transaction_status,
              COALESCE(a.amount, 0) AS agreed_amount
       FROM bookings b
       LEFT JOIN agreements a ON a.id = b.agreement_id
       WHERE b.id = ? AND b.gardener_id = ?
       LIMIT 1
       FOR UPDATE`,
      [bookingId, gardenerId],
    )
    const booking = bRows[0]
    if (!booking) {
      await connection.rollback()
      return res.status(404).json({ message: 'Booking was not found for this gardener.' })
    }

    const [pRows] = await connection.execute(
      'SELECT * FROM booking_payments WHERE id = ? AND booking_id = ? LIMIT 1 FOR UPDATE',
      [paymentId, bookingId],
    )
    const payment = pRows[0]
    if (!payment) {
      await connection.rollback()
      return res.status(404).json({ message: 'Payment record was not found.' })
    }
    if (payment.status !== 'pending') {
      await connection.rollback()
      return res.status(409).json({ message: `This payment has already been ${payment.status}.` })
    }

    if (decision === 'verified') {
      await connection.execute(
        `UPDATE booking_payments
         SET status = 'verified', verified_by = ?, verified_at = NOW(), rejection_reason = NULL
         WHERE id = ?`,
        [req.user.id, paymentId],
      )
    } else {
      await connection.execute(
        `UPDATE booking_payments
         SET status = 'rejected', verified_by = ?, verified_at = NOW(), rejection_reason = ?
         WHERE id = ?`,
        [req.user.id, rejectionReason, paymentId],
      )
    }

    const [[totals]] = await connection.execute(
      `SELECT
         COALESCE(SUM(CASE WHEN status = 'verified' THEN amount ELSE 0 END), 0) AS verified_total,
         SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_count
       FROM booking_payments WHERE booking_id = ?`,
      [bookingId],
    )
    const verifiedTotal = Number(Number(totals.verified_total || 0).toFixed(2))
    const pendingCount = Number(totals.pending_count || 0)
    const agreedAmount = Number(booking.agreed_amount || 0)
    const requiredDeposit = Number(booking.required_deposit_amount || 0)

    let nextPaymentStatus = 'unpaid'
    if (agreedAmount > 0 && verifiedTotal >= agreedAmount) nextPaymentStatus = 'fully_paid'
    else if (verifiedTotal > 0) nextPaymentStatus = 'partially_paid'
    else if (pendingCount > 0) nextPaymentStatus = 'pending_verification'

    const meetsDeposit = requiredDeposit <= 0 ? (agreedAmount <= 0 || verifiedTotal > 0) : verifiedTotal >= requiredDeposit
    const nextStage = meetsDeposit ? 'booked' : 'reserved'
    const nextTxnStatus = (booking.status === 'completed' && nextPaymentStatus === 'fully_paid' && booking.transaction_status === 'open')
      ? 'pending_closure'
      : booking.transaction_status

    await connection.execute(
      `UPDATE bookings
       SET amount_paid = ?, payment_status = ?, booking_stage = ?, transaction_status = ?,
           paid_at = CASE WHEN ? = 'booked' THEN COALESCE(paid_at, NOW()) ELSE paid_at END
       WHERE id = ?`,
      [verifiedTotal, nextPaymentStatus, nextStage, nextTxnStatus, nextStage, bookingId],
    )

    for (const notifyUserId of [booking.client_id, booking.gardener_id]) {
      await createNotification({
        userId: notifyUserId,
        type: 'booking_payment',
        title: decision === 'verified' ? 'Payment verified by clerk' : 'Payment proof rejected by clerk',
        message: decision === 'verified'
          ? `Assigned clerk verified payment ${payment.transaction_code || ''} of PHP ${Number(payment.amount).toFixed(2)} for Booking #${bookingId}.`
          : `Assigned clerk rejected payment proof of PHP ${Number(payment.amount).toFixed(2)} for Booking #${bookingId}. Reason: ${rejectionReason}`,
        entityType: 'booking',
        entityId: bookingId,
        connection,
      })
    }

    await connection.commit()
    return res.json({
      status: decision,
      booking: {
        id: bookingId,
        booking_stage: nextStage,
        payment_status: nextPaymentStatus,
        transaction_status: nextTxnStatus,
        amount_paid: verifiedTotal,
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
  addAssignedGardenerUnavailableDate,
  createAssignedGardenerService,
  getClerkWorkspace,
  removeAssignedGardenerUnavailableDate,
  toggleAssignedGardenerService,
  updateAssignedGardenerSchedule,
  verifyAssignedGardenerPayment,
}
