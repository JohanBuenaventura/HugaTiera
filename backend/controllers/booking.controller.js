const crypto = require('crypto')
const { pool } = require('../config/database')
const { createNotification } = require('../services/notification.service')
const {
  paymentReceiptsDirectory,
  processAndSavePaymentReceipt,
  removeFileIfExists,
  resolveContainedPath,
} = require('../middleware/upload.middleware')
const { parseSqlDateTimeParts, validateGardenerSchedule } = require('../utils/scheduling')
const {
  ONLINE_PAYMENT_METHODS,
  createCheckoutSession,
  getGatewayConfig,
  verifyCheckoutSession,
} = require('../services/paymentGateway.service')

const ALLOWED_PAYMENT_TYPES = new Set(['partial', 'full', 'balance'])
const ALLOWED_PAYMENT_METHODS = new Set(['gcash', 'maya', 'grab_pay', 'card', 'bank_transfer', 'cash', 'other'])
const EVENT_REASON_TYPES = new Set([
  'typhoon_weather',
  'accident_emergency',
  'schedule_conflict',
  'scope_or_plan_change',
  'property_access_issue',
  'other',
])
const EVENT_REASON_LABELS = {
  typhoon_weather: 'Severe Weather / Typhoon',
  accident_emergency: 'Accident / Emergency',
  schedule_conflict: 'Schedule Conflict / Unavailability',
  scope_or_plan_change: 'Change in Plans / Requirements',
  property_access_issue: 'Site / Property Access Issue',
  other: 'Other Reason',
}

function toSqlDateTime(value) {
  const parts = parseSqlDateTimeParts(value)
  if (!parts) return null
  return `${parts.dateStr} ${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}:00`
}

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function generateTransactionCode() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase()
  return `TXN-${y}${m}${d}-${rand}`
}

function toLocalDateKey(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function computeBookingUrgency(row) {
  if (!row) return { schedule_urgency: 'none', schedule_urgency_label: null }
  if (row.status === 'cancelled' || row.status === 'declined') {
    return { schedule_urgency: 'none', schedule_urgency_label: null }
  }
  if (row.status === 'completed') {
    if (row.payment_status !== 'fully_paid') {
      return { schedule_urgency: 'action_payment', schedule_urgency_label: 'Balance Payment Due' }
    }
    if ((row.transaction_status || 'open') !== 'closed') {
      return { schedule_urgency: 'action_closing', schedule_urgency_label: 'Sign Closing Agreement' }
    }
    return { schedule_urgency: 'none', schedule_urgency_label: null }
  }

  const now = new Date()
  const todayKey = toLocalDateKey(now)
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  const tomorrowKey = toLocalDateKey(tomorrow)
  const in7Days = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7)
  const in7DaysKey = toLocalDateKey(in7Days)

  const start = row.scheduled_start ? new Date(row.scheduled_start) : null
  const end = row.scheduled_end ? new Date(row.scheduled_end) : start
  if (start && !Number.isNaN(start.getTime())) {
    const startKey = toLocalDateKey(start)
    const endKey = end && !Number.isNaN(end.getTime()) ? toLocalDateKey(end) : startKey

    if (endKey < todayKey) {
      return { schedule_urgency: 'overdue', schedule_urgency_label: 'Overdue — Update Status' }
    }
    if (startKey <= todayKey && endKey >= todayKey) {
      return { schedule_urgency: 'urgent_today', schedule_urgency_label: 'Urgent — Due Today' }
    }
    if (startKey === tomorrowKey) {
      return { schedule_urgency: 'due_tomorrow', schedule_urgency_label: 'Due Tomorrow' }
    }
    if ((row.payment_status || 'unpaid') === 'pending_verification') {
      return { schedule_urgency: 'action_payment', schedule_urgency_label: 'Verify Payment Proof' }
    }
    if (startKey <= in7DaysKey) {
      return { schedule_urgency: 'todo_upcoming', schedule_urgency_label: 'To Do — This Week' }
    }
    return { schedule_urgency: 'todo_upcoming', schedule_urgency_label: 'Scheduled' }
  }

  if ((row.payment_status || 'unpaid') === 'pending_verification') {
    return { schedule_urgency: 'action_payment', schedule_urgency_label: 'Verify Payment Proof' }
  }
  return { schedule_urgency: 'todo_upcoming', schedule_urgency_label: 'To Do' }
}

function enrichBookingPaymentFields(row) {
  const agreedAmount = row.agreed_amount !== null && row.agreed_amount !== undefined ? Number(row.agreed_amount) : 0
  const amountPaid = Number(row.amount_paid || 0)
  const requiredDeposit = Number(row.required_deposit_amount || 0)
  const remainingBalance = Math.max(0, Number((agreedAmount - amountPaid).toFixed(2)))
  const paymentStatus = row.payment_status || 'unpaid'
  const transactionStatus = row.transaction_status || 'open'
  const urgency = computeBookingUrgency(row)
  return {
    ...row,
    booking_stage: row.booking_stage || 'reserved',
    payment_status: paymentStatus,
    transaction_status: transactionStatus,
    required_deposit_amount: requiredDeposit,
    amount_paid: amountPaid,
    remaining_balance: remainingBalance,
    workers_required: Math.max(1, Number(row.workers_required) || 1),
    can_review: row.status === 'completed' && paymentStatus === 'fully_paid' && transactionStatus === 'closed',
    ...urgency,
  }
}

async function syncUpcomingDueReminders(userId, enrichedBookings) {
  const urgentItems = enrichedBookings.filter((b) =>
    ['accepted', 'in_progress'].includes(b.status)
    && ['overdue', 'urgent_today', 'due_tomorrow'].includes(b.schedule_urgency),
  )
  if (urgentItems.length === 0) return

  for (const b of urgentItems.slice(0, 10)) {
    const [existing] = await pool.execute(
      `SELECT id FROM notifications
       WHERE user_id = ? AND notification_type = 'booking_reminder'
         AND related_entity_type = 'booking' AND related_entity_id = ?
         AND created_at >= DATE_SUB(NOW(), INTERVAL 18 HOUR)
       LIMIT 1`,
      [userId, b.id],
    )
    if (existing[0]) continue

    const title = b.schedule_urgency === 'overdue'
      ? `Overdue schedule: ${b.service_title || 'Gardening service'}`
      : b.schedule_urgency === 'urgent_today'
        ? `Urgent — Service due today: ${b.service_title || 'Gardening service'}`
        : `Reminder — Service due tomorrow: ${b.service_title || 'Gardening service'}`

    const startLabel = b.scheduled_start ? new Date(b.scheduled_start).toLocaleString() : 'Scheduled soon'
    const message = b.schedule_urgency === 'overdue'
      ? `Booking #${b.id} (${startLabel}) is past its scheduled end time. Please update its status, mark completed, or reschedule.`
      : b.schedule_urgency === 'urgent_today'
        ? `Booking #${b.id} is scheduled for today (${startLabel}) at ${b.location || 'Zamboanga City'}.`
        : `Booking #${b.id} is coming up tomorrow (${startLabel}) at ${b.location || 'Zamboanga City'}.`

    await createNotification({
      userId,
      type: 'booking_reminder',
      title: title.slice(0, 150),
      message,
      entityType: 'booking',
      entityId: b.id,
    }).catch(() => {})
  }
}

async function listBookings(req, res, next) {
  if (!['client', 'gardener'].includes(req.user.role)) {
    return res.status(403).json({ message: 'You do not have permission to access this resource.' })
  }
  const field = req.user.role === 'client' ? 'b.client_id' : 'b.gardener_id'
  try {
    const [bookings] = await pool.execute(
      `SELECT b.id, b.inquiry_id, b.quotation_id, b.agreement_id, b.client_id, b.gardener_id,
              b.service_id, b.scheduled_start, b.scheduled_end, b.location,
              b.notes, b.status, b.booking_stage, b.payment_status,
              b.required_deposit_amount, b.amount_paid, b.paid_at,
              b.transaction_status, b.client_completion_confirmed_at,
              b.gardener_completion_confirmed_at, b.transaction_closed_at,
              b.completion_agreement_notes,
              b.cancellation_reason_type, b.cancellation_reason, b.cancelled_by, b.cancelled_at,
              b.requested_at, b.updated_at,
              s.title AS service_title,
              COALESCE(s.workers_required, 1) AS workers_required,
              a.version AS agreement_version,
              a.amount AS agreed_amount,
              a.required_deposit_amount AS agreed_deposit_amount,
              a.scope_of_work AS agreed_scope,
              CONCAT(client.first_name, ' ', client.last_name) AS client_name,
              COALESCE(NULLIF(TRIM(gp.business_name), ''), CONCAT(gardener.first_name, ' ', gardener.last_name)) AS gardener_name,
              CONCAT(canceller.first_name, ' ', canceller.last_name) AS cancelled_by_name,
              canceller.role AS cancelled_by_role,
              (SELECT COUNT(*) FROM booking_reschedule_requests rr WHERE rr.booking_id = b.id AND rr.status = 'pending') AS pending_reschedule_count
       FROM bookings b
       LEFT JOIN services s ON s.id = b.service_id
       LEFT JOIN agreements a ON a.id = b.agreement_id
       JOIN users client ON client.id = b.client_id
       JOIN users gardener ON gardener.id = b.gardener_id
       LEFT JOIN gardener_profiles gp ON gp.user_id = b.gardener_id
       LEFT JOIN users canceller ON canceller.id = b.cancelled_by
       WHERE ${field} = ?
       ORDER BY b.updated_at DESC`,
      [req.user.id],
    )
    const enriched = bookings.map(enrichBookingPaymentFields)
    await syncUpcomingDueReminders(req.user.id, enriched).catch(() => {})
    return res.json({ bookings: enriched })
  } catch (error) {
    return next(error)
  }
}

async function getBooking(req, res, next) {
  if (!['client', 'gardener'].includes(req.user.role)) {
    return res.status(403).json({ message: 'You do not have permission to access this resource.' })
  }
  try {
    const bookingId = Number(req.params.bookingId)
    const [bookings] = await pool.execute(
      `SELECT b.id, b.inquiry_id, b.quotation_id, b.agreement_id, b.client_id, b.gardener_id,
              b.service_id, b.scheduled_start, b.scheduled_end, b.location,
              b.notes, b.status, b.booking_stage, b.payment_status,
              b.required_deposit_amount, b.amount_paid, b.paid_at,
              b.transaction_status, b.client_completion_confirmed_at,
              b.gardener_completion_confirmed_at, b.transaction_closed_at,
              b.completion_agreement_notes,
              b.cancellation_reason_type, b.cancellation_reason, b.cancelled_by, b.cancelled_at,
              b.requested_at, b.updated_at,
              s.title AS service_title,
              a.version AS agreement_version,
              a.amount AS agreed_amount,
              a.required_deposit_amount AS agreed_deposit_amount,
              a.price_basis AS agreed_price_basis,
              a.scope_of_work AS agreed_scope,
              a.conditions AS agreed_conditions,
              a.client_approved_at,
              a.gardener_approved_at,
              CONCAT(client.first_name, ' ', client.last_name) AS client_name,
              COALESCE(NULLIF(TRIM(gp.business_name), ''), CONCAT(gardener.first_name, ' ', gardener.last_name)) AS gardener_name,
              CONCAT(canceller.first_name, ' ', canceller.last_name) AS cancelled_by_name,
              canceller.role AS cancelled_by_role
       FROM bookings b
       LEFT JOIN services s ON s.id = b.service_id
       LEFT JOIN agreements a ON a.id = b.agreement_id
       JOIN users client ON client.id = b.client_id
       JOIN users gardener ON gardener.id = b.gardener_id
       LEFT JOIN gardener_profiles gp ON gp.user_id = b.gardener_id
       LEFT JOIN users canceller ON canceller.id = b.cancelled_by
       WHERE b.id = ? AND (b.client_id = ? OR b.gardener_id = ?)
       LIMIT 1`,
      [bookingId, req.user.id, req.user.id],
    )
    if (!bookings[0]) return res.status(404).json({ message: 'Booking was not found.' })

    const [payments] = await pool.execute(
      `SELECT p.id, p.transaction_code, p.booking_id, p.submitted_by, p.payment_type, p.payment_method,
              p.gateway_provider, p.gateway_session_id, p.gateway_checkout_url, p.gateway_status, p.gateway_paid_at,
              p.amount, p.reference_number, p.receipt_path, p.notes, p.status,
              p.verified_by, p.verified_at, p.rejection_reason, p.created_at, p.updated_at,
              CONCAT(sub.first_name, ' ', sub.last_name) AS submitted_by_name,
              CONCAT(ver.first_name, ' ', ver.last_name) AS verified_by_name
       FROM booking_payments p
       JOIN users sub ON sub.id = p.submitted_by
       LEFT JOIN users ver ON ver.id = p.verified_by
       WHERE p.booking_id = ?
       ORDER BY p.created_at DESC, p.id DESC`,
      [bookingId],
    )

    const [rescheduleRequests] = await pool.execute(
      `SELECT rr.id, rr.booking_id, rr.requested_by, rr.reason_type, rr.reason_details,
              rr.previous_start, rr.previous_end, rr.proposed_start, rr.proposed_end,
              rr.status, rr.responded_by, rr.responded_at, rr.response_note,
              rr.created_at, rr.updated_at,
              CONCAT(req_u.first_name, ' ', req_u.last_name) AS requested_by_name,
              req_u.role AS requested_by_role,
              CONCAT(res_u.first_name, ' ', res_u.last_name) AS responded_by_name,
              res_u.role AS responded_by_role
       FROM booking_reschedule_requests rr
       JOIN users req_u ON req_u.id = rr.requested_by
       LEFT JOIN users res_u ON res_u.id = rr.responded_by
       WHERE rr.booking_id = ?
       ORDER BY rr.created_at DESC, rr.id DESC`,
      [bookingId],
    )

    return res.json({
      booking: enrichBookingPaymentFields(bookings[0]),
      payments,
      rescheduleRequests,
    })
  } catch (error) {
    return next(error)
  }
}

async function createBooking(req, res) {
  if (req.user.role !== 'client') {
    return res.status(403).json({ message: 'Only clients can submit booking requests.' })
  }
  return res.status(409).json({
    code: 'MUTUAL_AGREEMENT_REQUIRED',
    message: 'Direct booking creation is not allowed. A reservation is created automatically only after both the client and the gardener approve the same mutual agreement version.',
  })
}

const transitions = {
  gardener: {
    accepted: ['pending'],
    declined: ['pending'],
    in_progress: ['accepted'],
    completed: ['in_progress'],
    cancelled: ['pending', 'accepted', 'in_progress'],
  },
  client: {
    cancelled: ['pending', 'accepted', 'in_progress'],
  },
}

async function updateBookingStatus(req, res, next) {
  if (!['client', 'gardener'].includes(req.user.role)) {
    return res.status(403).json({ message: 'You do not have permission to access this resource.' })
  }
  const status = text(req.body.status)
  const role = req.user.role
  if (!transitions[role] || !transitions[role][status]) return res.status(400).json({ message: 'This booking status transition is not allowed.' })

  let cancellationReasonType = null
  let cancellationReason = null
  if (status === 'cancelled') {
    cancellationReasonType = text(req.body.cancellationReasonType ?? req.body.cancellation_reason_type).toLowerCase()
    cancellationReason = text(req.body.cancellationReason ?? req.body.cancellation_reason)
    if (!EVENT_REASON_TYPES.has(cancellationReasonType)) {
      return res.status(400).json({
        message: 'Please select a valid cancellation event/reason (e.g., typhoon/weather, accident/emergency, schedule conflict, plan change, or site access issue).',
      })
    }
    if (!cancellationReason || cancellationReason.length < 3 || cancellationReason.length > 1000) {
      return res.status(400).json({
        message: 'Please provide a brief cancellation explanation (3 to 1,000 characters).',
      })
    }
  }

  const allowed = transitions[role][status]
  const ownerField = role === 'client' ? 'client_id' : 'gardener_id'
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [rows] = await connection.execute(
      `SELECT id, client_id, gardener_id, scheduled_start, scheduled_end,
              booking_stage, payment_status, required_deposit_amount, amount_paid, transaction_status
       FROM bookings
       WHERE id = ? AND ${ownerField} = ? AND status IN (${allowed.map(() => '?').join(',')}) FOR UPDATE`,
      [Number(req.params.bookingId), req.user.id, ...allowed],
    )
    if (!rows[0]) {
      await connection.rollback()
      return res.status(409).json({ message: 'Booking was not found or the status transition is no longer available.' })
    }
    if (status === 'in_progress' && rows[0].booking_stage !== 'booked') {
      await connection.rollback()
      const deposit = Number(rows[0].required_deposit_amount || 0)
      return res.status(409).json({
        code: 'PAYMENT_REQUIRED',
        message: deposit > 0
          ? `This is still a reservation. At least the required deposit (PHP ${deposit.toFixed(2)}) must be paid and verified before starting this booking.`
          : 'This is still a reservation. A partial or full payment must be verified before starting this booking.',
      })
    }
    if (status === 'accepted' && rows[0].scheduled_start && rows[0].scheduled_end) {
      const scheduleCheck = await validateGardenerSchedule(connection, {
        gardenerId: rows[0].gardener_id,
        scheduledStart: rows[0].scheduled_start,
        scheduledEnd: rows[0].scheduled_end,
        excludeBookingId: rows[0].id,
      })
      if (!scheduleCheck.ok) {
        await connection.rollback()
        return res.status(scheduleCheck.status || 409).json({
          code: scheduleCheck.code,
          message: scheduleCheck.message,
        })
      }
    }
    const nextTxnStatus = (status === 'completed' && rows[0].payment_status === 'fully_paid' && rows[0].transaction_status === 'open')
      ? 'pending_closure'
      : rows[0].transaction_status

    if (status === 'cancelled') {
      await connection.execute(
        `UPDATE bookings
         SET status = 'cancelled',
             cancellation_reason_type = ?,
             cancellation_reason = ?,
             cancelled_by = ?,
             cancelled_at = NOW()
         WHERE id = ?`,
        [cancellationReasonType, cancellationReason, req.user.id, rows[0].id],
      )
      await connection.execute(
        `UPDATE booking_reschedule_requests
         SET status = 'cancelled',
             responded_by = ?,
             responded_at = NOW(),
             response_note = COALESCE(response_note, 'Booking was cancelled.')
         WHERE booking_id = ? AND status = 'pending'`,
        [req.user.id, rows[0].id],
      )
    } else {
      await connection.execute(
        'UPDATE bookings SET status = ?, transaction_status = ? WHERE id = ?',
        [status, nextTxnStatus, rows[0].id],
      )
    }

    const recipientId = role === 'client' ? rows[0].gardener_id : rows[0].client_id
    const actorLabel = role === 'client' ? 'The client' : 'The gardener'
    const reasonLabel = cancellationReasonType ? (EVENT_REASON_LABELS[cancellationReasonType] || cancellationReasonType) : ''
    const paidNotice = Number(rows[0].amount_paid || 0) > 0
      ? ` Verified payments of PHP ${Number(rows[0].amount_paid).toFixed(2)} were recorded — please coordinate directly regarding any deposit adjustment or re-booking.`
      : ''
    const statusNotificationMsg = status === 'cancelled'
      ? `${actorLabel} cancelled this booking due to ${reasonLabel}: "${cancellationReason}".${paidNotice}`
      : status === 'completed'
        ? (rows[0].payment_status === 'fully_paid'
          ? 'Your gardening service is marked completed and fully paid. Sign the Transaction Completion Agreement to close the transaction and unlock rating.'
          : 'Your gardening service is marked completed. Settle any remaining balance so both parties can sign the Transaction Completion Agreement and unlock rating.')
        : `Your booking is now ${status.replace('_', ' ')}.`
    await createNotification({
      userId: recipientId,
      type: 'booking_status',
      title: status === 'cancelled' ? `Booking cancelled (${reasonLabel})` : 'Booking status updated',
      message: statusNotificationMsg,
      entityType: 'booking',
      entityId: rows[0].id,
      connection,
    })
    await connection.commit()
    return res.json({
      status,
      ...(status === 'cancelled' ? {
        cancellation_reason_type: cancellationReasonType,
        cancellation_reason: cancellationReason,
        cancelled_by: req.user.id,
      } : {}),
    })
  } catch (error) {
    await connection.rollback()
    return next(error)
  } finally {
    connection.release()
  }
}

async function submitPayment(req, res, next) {
  const bookingId = Number(req.params.bookingId)
  if (!Number.isInteger(bookingId) || bookingId < 1) {
    return res.status(400).json({ message: 'A valid booking ID is required.' })
  }

  const paymentType = text(req.body?.paymentType ?? req.body?.payment_type).toLowerCase() || 'partial'
  const paymentMethod = text(req.body?.paymentMethod ?? req.body?.payment_method).toLowerCase() || 'gcash'
  const amount = Number(req.body?.amount)
  const referenceNumber = text(req.body?.referenceNumber ?? req.body?.reference_number) || null
  const notes = text(req.body?.notes) || null

  if (!ALLOWED_PAYMENT_TYPES.has(paymentType)) {
    return res.status(400).json({ message: 'Payment type must be partial, full, or balance.' })
  }
  if (!ALLOWED_PAYMENT_METHODS.has(paymentMethod)) {
    return res.status(400).json({ message: 'Payment method must be gcash, maya, bank_transfer, cash, or other.' })
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ message: 'Payment amount must be greater than 0.' })
  }
  if (referenceNumber && referenceNumber.length > 100) {
    return res.status(400).json({ message: 'Reference number must be 100 characters or fewer.' })
  }
  if (notes && notes.length > 500) {
    return res.status(400).json({ message: 'Payment notes must be 500 characters or fewer.' })
  }

  let savedReceipt = null
  const connection = await pool.getConnection()
  try {
    if (req.file && req.file.buffer) {
      savedReceipt = await processAndSavePaymentReceipt(req.file.buffer, req.user.id)
    }

    await connection.beginTransaction()
    const [rows] = await connection.execute(
      `SELECT b.id, b.client_id, b.gardener_id, b.status, b.booking_stage, b.payment_status,
              b.required_deposit_amount, b.amount_paid,
              COALESCE(a.amount, 0) AS agreed_amount
       FROM bookings b
       LEFT JOIN agreements a ON a.id = b.agreement_id
       WHERE b.id = ? AND b.client_id = ?
       LIMIT 1
       FOR UPDATE`,
      [bookingId, req.user.id],
    )
    const booking = rows[0]
    if (!booking) {
      await connection.rollback()
      if (savedReceipt) await removeFileIfExists(paymentReceiptsDirectory, savedReceipt.relativePath)
      return res.status(404).json({ message: 'Reservation or booking was not found.' })
    }
    if (!['accepted', 'in_progress', 'completed'].includes(booking.status)) {
      await connection.rollback()
      if (savedReceipt) await removeFileIfExists(paymentReceiptsDirectory, savedReceipt.relativePath)
      return res.status(409).json({ message: 'Payments can only be submitted for active or completed reservations and bookings.' })
    }
    if (booking.payment_status === 'fully_paid') {
      await connection.rollback()
      if (savedReceipt) await removeFileIfExists(paymentReceiptsDirectory, savedReceipt.relativePath)
      return res.status(409).json({ message: 'This booking is already fully paid.' })
    }

    const cleanAmount = Number(amount.toFixed(2))
    const transactionCode = generateTransactionCode()
    const [ins] = await connection.execute(
      `INSERT INTO booking_payments
        (transaction_code, booking_id, submitted_by, payment_type, payment_method, amount, reference_number, receipt_path, notes, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        transactionCode,
        bookingId,
        req.user.id,
        paymentType,
        paymentMethod,
        cleanAmount,
        referenceNumber,
        savedReceipt ? savedReceipt.relativePath : null,
        notes,
      ],
    )

    if (booking.payment_status === 'unpaid') {
      await connection.execute(
        "UPDATE bookings SET payment_status = 'pending_verification' WHERE id = ?",
        [bookingId],
      )
    }

    await createNotification({
      userId: booking.gardener_id,
      type: 'booking_payment',
      title: 'Payment proof submitted',
      message: `Client submitted a ${paymentType} payment proof of PHP ${cleanAmount.toFixed(2)} (${paymentMethod.replace('_', ' ')}) for verification.`,
      entityType: 'booking',
      entityId: bookingId,
      connection,
    })

    const [createdRows] = await connection.execute('SELECT * FROM booking_payments WHERE id = ? LIMIT 1', [ins.insertId])
    await connection.commit()
    return res.status(201).json({
      id: ins.insertId,
      payment: createdRows[0],
    })
  } catch (error) {
    await connection.rollback().catch(() => {})
    if (savedReceipt) await removeFileIfExists(paymentReceiptsDirectory, savedReceipt.relativePath)
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message })
    return next(error)
  } finally {
    connection.release()
  }
}

async function verifyPayment(req, res, next) {
  const bookingId = Number(req.params.bookingId)
  const paymentId = Number(req.params.paymentId)
  if (!Number.isInteger(bookingId) || bookingId < 1 || !Number.isInteger(paymentId) || paymentId < 1) {
    return res.status(400).json({ message: 'Valid booking and payment IDs are required.' })
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
    const [bRows] = await connection.execute(
      `SELECT b.id, b.client_id, b.gardener_id, b.status, b.booking_stage, b.payment_status,
              b.required_deposit_amount, b.amount_paid, b.paid_at, b.transaction_status,
              COALESCE(a.amount, 0) AS agreed_amount
       FROM bookings b
       LEFT JOIN agreements a ON a.id = b.agreement_id
       WHERE b.id = ? AND b.gardener_id = ?
       LIMIT 1
       FOR UPDATE`,
      [bookingId, req.user.id],
    )
    const booking = bRows[0]
    if (!booking) {
      await connection.rollback()
      return res.status(404).json({ message: 'Booking was not found.' })
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
       FROM booking_payments
       WHERE booking_id = ?`,
      [bookingId],
    )

    const verifiedTotal = Number(Number(totals.verified_total || 0).toFixed(2))
    const pendingCount = Number(totals.pending_count || 0)
    const agreedAmount = Number(booking.agreed_amount || 0)
    const requiredDeposit = Number(booking.required_deposit_amount || 0)

    let nextPaymentStatus = 'unpaid'
    if (agreedAmount > 0 && verifiedTotal >= agreedAmount) {
      nextPaymentStatus = 'fully_paid'
    } else if (verifiedTotal > 0) {
      nextPaymentStatus = 'partially_paid'
    } else if (pendingCount > 0) {
      nextPaymentStatus = 'pending_verification'
    }

    const meetsDeposit = requiredDeposit <= 0 ? (agreedAmount <= 0 || verifiedTotal > 0) : verifiedTotal >= requiredDeposit
    const nextStage = meetsDeposit ? 'booked' : 'reserved'
    const upgradedToBooked = booking.booking_stage !== 'booked' && nextStage === 'booked'
    const nextTxnStatus = (booking.status === 'completed' && nextPaymentStatus === 'fully_paid' && booking.transaction_status === 'open')
      ? 'pending_closure'
      : booking.transaction_status

    await connection.execute(
      `UPDATE bookings
       SET amount_paid = ?,
           payment_status = ?,
           booking_stage = ?,
           transaction_status = ?,
           paid_at = CASE WHEN ? = 'booked' THEN COALESCE(paid_at, NOW()) ELSE paid_at END
       WHERE id = ?`,
      [verifiedTotal, nextPaymentStatus, nextStage, nextTxnStatus, nextStage, bookingId],
    )

    await createNotification({
      userId: booking.client_id,
      type: 'booking_payment',
      title: decision === 'verified'
        ? (nextPaymentStatus === 'fully_paid' && booking.status === 'completed'
          ? 'Full payment verified — ready for closing agreement'
          : (upgradedToBooked ? 'Booking confirmed — payment verified!' : 'Payment verified'))
        : 'Payment proof rejected',
      message: decision === 'verified'
        ? (nextPaymentStatus === 'fully_paid' && booking.status === 'completed'
          ? `Your payment of PHP ${Number(payment.amount).toFixed(2)} (${payment.transaction_code}) was verified. Full payment is complete — both parties can now sign the Transaction Completion Agreement to unlock rating.`
          : (upgradedToBooked
            ? `Your payment of PHP ${Number(payment.amount).toFixed(2)} (${payment.transaction_code}) was verified. Your reservation is now a confirmed paid booking!`
            : `Your payment of PHP ${Number(payment.amount).toFixed(2)} (${payment.transaction_code}) was verified. Total paid: PHP ${verifiedTotal.toFixed(2)}.`))
        : `Your payment submission of PHP ${Number(payment.amount).toFixed(2)} was rejected. Reason: ${rejectionReason}`,
      entityType: 'booking',
      entityId: bookingId,
      connection,
    })

    const [updatedPaymentRows] = await connection.execute('SELECT * FROM booking_payments WHERE id = ? LIMIT 1', [paymentId])
    await connection.commit()
    return res.json({
      payment: updatedPaymentRows[0],
      booking: {
        id: bookingId,
        booking_stage: nextStage,
        payment_status: nextPaymentStatus,
        transaction_status: nextTxnStatus,
        can_review: booking.status === 'completed' && nextPaymentStatus === 'fully_paid' && nextTxnStatus === 'closed',
        amount_paid: verifiedTotal,
        required_deposit_amount: requiredDeposit,
        remaining_balance: Math.max(0, Number((agreedAmount - verifiedTotal).toFixed(2))),
      },
    })
  } catch (error) {
    await connection.rollback().catch(() => {})
    return next(error)
  } finally {
    connection.release()
  }
}

async function sendPaymentReceipt(req, res, next) {
  const bookingId = Number(req.params.bookingId)
  const paymentId = Number(req.params.paymentId)
  if (!Number.isInteger(bookingId) || bookingId < 1 || !Number.isInteger(paymentId) || paymentId < 1) {
    return res.status(400).json({ message: 'Valid booking and payment IDs are required.' })
  }
  try {
    const [rows] = await pool.execute(
      `SELECT p.receipt_path, b.client_id, b.gardener_id
       FROM booking_payments p
       JOIN bookings b ON b.id = p.booking_id
       WHERE p.id = ? AND p.booking_id = ?
       LIMIT 1`,
      [paymentId, bookingId],
    )
    const row = rows[0]
    if (!row || !row.receipt_path) {
      return res.status(404).json({ message: 'Payment receipt was not found.' })
    }
    let isAllowed = req.user.role === 'administrator'
      || row.client_id === req.user.id
      || row.gardener_id === req.user.id
    if (!isAllowed && req.user.role === 'clerk') {
      const [cga] = await pool.execute(
        'SELECT id FROM clerk_gardener_assignments WHERE clerk_id = ? AND gardener_id = ? LIMIT 1',
        [req.user.id, row.gardener_id],
      )
      isAllowed = Boolean(cga[0])
    }
    if (!isAllowed) {
      return res.status(403).json({ message: 'You do not have permission to view this payment receipt.' })
    }
    const absolutePath = resolveContainedPath(paymentReceiptsDirectory, row.receipt_path)
    res.set('Cache-Control', 'no-store')
    return res.sendFile(absolutePath, (err) => {
      if (err && !res.headersSent) {
        return res.status(404).json({ message: 'Payment receipt file was not found.' })
      }
      return undefined
    })
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message })
    return next(error)
  }
}

async function confirmTransactionCompletion(req, res, next) {
  const bookingId = Number(req.params.bookingId)
  if (!Number.isInteger(bookingId) || bookingId < 1) {
    return res.status(400).json({ message: 'A valid booking ID is required.' })
  }

  const note = text(req.body?.note) || null
  if (note && note.length > 1000) {
    return res.status(400).json({ message: 'Closing agreement note must be 1,000 characters or fewer.' })
  }

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [rows] = await connection.execute(
      `SELECT b.id, b.client_id, b.gardener_id, b.status, b.booking_stage, b.payment_status,
              b.required_deposit_amount, b.amount_paid, b.transaction_status,
              b.client_completion_confirmed_at, b.gardener_completion_confirmed_at,
              b.transaction_closed_at, b.completion_agreement_notes,
              COALESCE(a.amount, 0) AS agreed_amount
       FROM bookings b
       LEFT JOIN agreements a ON a.id = b.agreement_id
       WHERE b.id = ? AND (b.client_id = ? OR b.gardener_id = ?)
       LIMIT 1
       FOR UPDATE`,
      [bookingId, req.user.id, req.user.id],
    )
    const booking = rows[0]
    if (!booking) {
      await connection.rollback()
      return res.status(404).json({ message: 'Booking was not found.' })
    }
    if (booking.status !== 'completed') {
      await connection.rollback()
      return res.status(409).json({
        code: 'WORK_NOT_COMPLETED',
        message: 'The gardener must mark the service work completed before signing the Transaction Completion Agreement.',
      })
    }
    if (booking.payment_status !== 'fully_paid') {
      await connection.rollback()
      return res.status(409).json({
        code: 'FULL_PAYMENT_REQUIRED',
        message: 'Full payment must be verified before signing the Transaction Completion Agreement.',
      })
    }
    if (booking.transaction_status === 'closed') {
      await connection.rollback()
      return res.status(409).json({
        code: 'TRANSACTION_ALREADY_CLOSED',
        message: 'This transaction has already been closed by both parties.',
      })
    }

    const isClient = booking.client_id === req.user.id
    if (isClient && booking.client_completion_confirmed_at) {
      await connection.rollback()
      return res.status(409).json({
        code: 'ALREADY_CONFIRMED',
        message: 'You have already signed the Transaction Completion Agreement. Waiting for the gardener to confirm.',
      })
    }
    if (!isClient && booking.gardener_completion_confirmed_at) {
      await connection.rollback()
      return res.status(409).json({
        code: 'ALREADY_CONFIRMED',
        message: 'You have already signed the Transaction Completion Agreement. Waiting for the client to confirm.',
      })
    }

    const otherAlreadyConfirmed = isClient
      ? Boolean(booking.gardener_completion_confirmed_at)
      : Boolean(booking.client_completion_confirmed_at)

    const nextTransactionStatus = otherAlreadyConfirmed ? 'closed' : 'pending_closure'
    const roleLabel = isClient ? 'Client' : 'Gardener'
    const nextNotes = note
      ? [booking.completion_agreement_notes, `${roleLabel}: ${note}`].filter(Boolean).join('\n')
      : booking.completion_agreement_notes

    const confirmColumn = isClient ? 'client_completion_confirmed_at' : 'gardener_completion_confirmed_at'
    await connection.execute(
      `UPDATE bookings
       SET ${confirmColumn} = NOW(),
           transaction_status = ?,
           transaction_closed_at = CASE WHEN ? = 'closed' THEN NOW() ELSE transaction_closed_at END,
           completion_agreement_notes = ?
       WHERE id = ?`,
      [nextTransactionStatus, nextTransactionStatus, nextNotes, bookingId],
    )

    const recipientId = isClient ? booking.gardener_id : booking.client_id
    await createNotification({
      userId: recipientId,
      type: 'booking_status',
      title: otherAlreadyConfirmed
        ? 'Transaction closed — closing agreement completed'
        : 'Transaction Completion Agreement awaiting your sign-off',
      message: otherAlreadyConfirmed
        ? 'Both parties signed the Transaction Completion Agreement. The transaction is now closed and the client can submit a rating and review.'
        : `The ${roleLabel.toLowerCase()} signed the Transaction Completion Agreement. Please review and confirm to close the transaction.`,
      entityType: 'booking',
      entityId: bookingId,
      connection,
    })

    const [updatedRows] = await connection.execute(
      `SELECT b.*, a.amount AS agreed_amount
       FROM bookings b
       LEFT JOIN agreements a ON a.id = b.agreement_id
       WHERE b.id = ? LIMIT 1`,
      [bookingId],
    )
    await connection.commit()
    return res.json({
      closed: nextTransactionStatus === 'closed',
      transaction_status: nextTransactionStatus,
      booking: enrichBookingPaymentFields(updatedRows[0]),
    })
  } catch (error) {
    await connection.rollback().catch(() => {})
    return next(error)
  } finally {
    connection.release()
  }
}

async function createRescheduleRequest(req, res, next) {
  const bookingId = Number(req.params.bookingId)
  if (!Number.isInteger(bookingId) || bookingId < 1) {
    return res.status(400).json({ message: 'A valid booking ID is required.' })
  }

  const reasonType = text(req.body?.reasonType ?? req.body?.reason_type).toLowerCase()
  const reasonDetails = text(req.body?.reasonDetails ?? req.body?.reason_details)
  const proposedStartRaw = req.body?.proposedStart ?? req.body?.proposed_start
  const proposedEndRaw = req.body?.proposedEnd ?? req.body?.proposed_end

  if (!EVENT_REASON_TYPES.has(reasonType)) {
    return res.status(400).json({ message: 'Please select a valid reschedule event/reason.' })
  }
  if (!reasonDetails || reasonDetails.length < 3 || reasonDetails.length > 1000) {
    return res.status(400).json({ message: 'Please provide a brief explanation for moving the date (3 to 1,000 characters).' })
  }

  const startParts = parseSqlDateTimeParts(proposedStartRaw)
  const endParts = parseSqlDateTimeParts(proposedEndRaw)
  if (!startParts || !endParts || endParts.ms <= startParts.ms) {
    return res.status(400).json({ message: 'Proposed end date and time must be after the proposed start date and time.' })
  }
  const sqlProposedStart = toSqlDateTime(proposedStartRaw)
  const sqlProposedEnd = toSqlDateTime(proposedEndRaw)

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [bRows] = await connection.execute(
      `SELECT id, client_id, gardener_id, service_id, status, scheduled_start, scheduled_end
       FROM bookings
       WHERE id = ? AND (client_id = ? OR gardener_id = ?)
       LIMIT 1
       FOR UPDATE`,
      [bookingId, req.user.id, req.user.id],
    )
    const booking = bRows[0]
    if (!booking) {
      await connection.rollback()
      return res.status(404).json({ message: 'Booking was not found.' })
    }
    if (!['pending', 'accepted', 'in_progress'].includes(booking.status)) {
      await connection.rollback()
      return res.status(409).json({
        code: 'BOOKING_NOT_RESCHEDULABLE',
        message: 'Only active reservations or bookings (pending, accepted, or in progress) can be rescheduled.',
      })
    }

    const [pendingRows] = await connection.execute(
      "SELECT id FROM booking_reschedule_requests WHERE booking_id = ? AND status = 'pending' LIMIT 1 FOR UPDATE",
      [bookingId],
    )
    if (pendingRows[0]) {
      await connection.rollback()
      return res.status(409).json({
        code: 'RESCHEDULE_ALREADY_PENDING',
        message: 'There is already a pending reschedule request for this booking. Wait for a response or withdraw it first.',
      })
    }

    const scheduleCheck = await validateGardenerSchedule(connection, {
      gardenerId: booking.gardener_id,
      scheduledStart: sqlProposedStart,
      scheduledEnd: sqlProposedEnd,
      serviceId: booking.service_id || null,
      excludeBookingId: booking.id,
    })
    if (!scheduleCheck.ok) {
      await connection.rollback()
      return res.status(scheduleCheck.status || 409).json({
        code: scheduleCheck.code,
        message: scheduleCheck.message,
      })
    }

    const prevStart = booking.scheduled_start || sqlProposedStart
    const prevEnd = booking.scheduled_end || sqlProposedEnd
    const [ins] = await connection.execute(
      `INSERT INTO booking_reschedule_requests
        (booking_id, requested_by, reason_type, reason_details, previous_start, previous_end, proposed_start, proposed_end, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [bookingId, req.user.id, reasonType, reasonDetails, prevStart, prevEnd, sqlProposedStart, sqlProposedEnd],
    )

    const isClient = booking.client_id === req.user.id
    const recipientId = isClient ? booking.gardener_id : booking.client_id
    const reasonLabel = EVENT_REASON_LABELS[reasonType] || reasonType
    await createNotification({
      userId: recipientId,
      type: 'booking_reschedule',
      title: `Reschedule requested (${reasonLabel})`,
      message: `${isClient ? 'The client' : 'The gardener'} requested to move the schedule due to ${reasonLabel}: "${reasonDetails}". Review and approve or decline the proposed new date.`,
      entityType: 'booking',
      entityId: bookingId,
      connection,
    })

    const [createdRows] = await connection.execute(
      `SELECT rr.*,
              CONCAT(req_u.first_name, ' ', req_u.last_name) AS requested_by_name,
              req_u.role AS requested_by_role
       FROM booking_reschedule_requests rr
       JOIN users req_u ON req_u.id = rr.requested_by
       WHERE rr.id = ? LIMIT 1`,
      [ins.insertId],
    )
    await connection.commit()
    return res.status(201).json({
      id: ins.insertId,
      rescheduleRequest: createdRows[0],
    })
  } catch (error) {
    await connection.rollback().catch(() => {})
    return next(error)
  } finally {
    connection.release()
  }
}

async function respondRescheduleRequest(req, res, next) {
  const bookingId = Number(req.params.bookingId)
  const requestId = Number(req.params.requestId)
  if (!Number.isInteger(bookingId) || bookingId < 1 || !Number.isInteger(requestId) || requestId < 1) {
    return res.status(400).json({ message: 'Valid booking and reschedule request IDs are required.' })
  }

  const decision = text(req.body?.decision ?? req.body?.status).toLowerCase()
  const responseNote = text(req.body?.responseNote ?? req.body?.response_note) || null
  if (!['approved', 'declined', 'cancelled'].includes(decision)) {
    return res.status(400).json({ message: 'Decision must be approved, declined, or cancelled.' })
  }
  if (responseNote && responseNote.length > 500) {
    return res.status(400).json({ message: 'Response note must be 500 characters or fewer.' })
  }

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [bRows] = await connection.execute(
      `SELECT b.*, COALESCE(a.amount, 0) AS agreed_amount
       FROM bookings b
       LEFT JOIN agreements a ON a.id = b.agreement_id
       WHERE b.id = ? AND (b.client_id = ? OR b.gardener_id = ?)
       LIMIT 1
       FOR UPDATE`,
      [bookingId, req.user.id, req.user.id],
    )
    const booking = bRows[0]
    if (!booking) {
      await connection.rollback()
      return res.status(404).json({ message: 'Booking was not found.' })
    }

    const [rrRows] = await connection.execute(
      'SELECT * FROM booking_reschedule_requests WHERE id = ? AND booking_id = ? LIMIT 1 FOR UPDATE',
      [requestId, bookingId],
    )
    const rr = rrRows[0]
    if (!rr) {
      await connection.rollback()
      return res.status(404).json({ message: 'Reschedule request was not found.' })
    }
    if (rr.status !== 'pending') {
      await connection.rollback()
      return res.status(409).json({
        code: 'RESCHEDULE_NOT_PENDING',
        message: `This reschedule request has already been ${rr.status}.`,
      })
    }

    const isRequester = rr.requested_by === req.user.id
    if (decision === 'cancelled') {
      if (!isRequester) {
        await connection.rollback()
        return res.status(403).json({ message: 'Only the person who submitted this reschedule request can withdraw it.' })
      }
    } else if (isRequester) {
      await connection.rollback()
      return res.status(403).json({
        code: 'SELF_APPROVAL_FORBIDDEN',
        message: 'You cannot approve or decline your own reschedule request. Waiting for the other party to respond.',
      })
    }

    if (decision === 'approved') {
      if (!['pending', 'accepted', 'in_progress'].includes(booking.status)) {
        await connection.rollback()
        return res.status(409).json({
          code: 'BOOKING_NOT_RESCHEDULABLE',
          message: 'This booking can no longer be rescheduled.',
        })
      }
      const scheduleCheck = await validateGardenerSchedule(connection, {
        gardenerId: booking.gardener_id,
        scheduledStart: rr.proposed_start,
        scheduledEnd: rr.proposed_end,
        serviceId: booking.service_id || null,
        excludeBookingId: booking.id,
      })
      if (!scheduleCheck.ok) {
        await connection.rollback()
        return res.status(scheduleCheck.status || 409).json({
          code: scheduleCheck.code,
          message: scheduleCheck.message,
        })
      }
      await connection.execute(
        'UPDATE bookings SET scheduled_start = ?, scheduled_end = ? WHERE id = ?',
        [rr.proposed_start, rr.proposed_end, bookingId],
      )
    }

    await connection.execute(
      `UPDATE booking_reschedule_requests
       SET status = ?, responded_by = ?, responded_at = NOW(), response_note = ?
       WHERE id = ?`,
      [decision, req.user.id, responseNote, requestId],
    )

    const recipientId = req.user.id === booking.client_id ? booking.gardener_id : booking.client_id
    const notifTitle = decision === 'approved'
      ? 'Reschedule approved — new date confirmed'
      : decision === 'declined'
        ? 'Reschedule request declined'
        : 'Reschedule request withdrawn'
    const notifMessage = decision === 'approved'
      ? `The proposed new schedule was mutually approved and updated on Booking #${bookingId}. Your agreement and verified payments remain intact.${responseNote ? ` Note: ${responseNote}` : ''}`
      : decision === 'declined'
        ? `The proposed reschedule request was declined. The original schedule remains active.${responseNote ? ` Note: ${responseNote}` : ''}`
        : `The pending reschedule request was withdrawn. The original schedule remains active.`

    await createNotification({
      userId: recipientId,
      type: 'booking_reschedule',
      title: notifTitle,
      message: notifMessage,
      entityType: 'booking',
      entityId: bookingId,
      connection,
    })

    const [updatedRrRows] = await connection.execute(
      `SELECT rr.*,
              CONCAT(req_u.first_name, ' ', req_u.last_name) AS requested_by_name,
              req_u.role AS requested_by_role,
              CONCAT(res_u.first_name, ' ', res_u.last_name) AS responded_by_name,
              res_u.role AS responded_by_role
       FROM booking_reschedule_requests rr
       JOIN users req_u ON req_u.id = rr.requested_by
       LEFT JOIN users res_u ON res_u.id = rr.responded_by
       WHERE rr.id = ? LIMIT 1`,
      [requestId],
    )
    const [updatedBookingRows] = await connection.execute(
      `SELECT b.*, COALESCE(a.amount, 0) AS agreed_amount
       FROM bookings b
       LEFT JOIN agreements a ON a.id = b.agreement_id
       WHERE b.id = ? LIMIT 1`,
      [bookingId],
    )
    await connection.commit()
    return res.json({
      rescheduleRequest: updatedRrRows[0],
      booking: enrichBookingPaymentFields(updatedBookingRows[0]),
    })
  } catch (error) {
    await connection.rollback().catch(() => {})
    return next(error)
  } finally {
    connection.release()
  }
}

function getPaymentGatewayConfig(req, res) {
  return res.json({ gateway: getGatewayConfig() })
}

async function createGatewayCheckout(req, res, next) {
  const bookingId = Number(req.params.bookingId)
  if (!Number.isInteger(bookingId) || bookingId < 1) {
    return res.status(400).json({ message: 'A valid booking ID is required.' })
  }

  const paymentType = text(req.body?.paymentType ?? req.body?.payment_type).toLowerCase() || 'partial'
  const paymentMethod = text(req.body?.paymentMethod ?? req.body?.payment_method).toLowerCase() || 'gcash'
  const amount = Number(req.body?.amount)
  const notes = text(req.body?.notes) || null

  if (!ALLOWED_PAYMENT_TYPES.has(paymentType)) {
    return res.status(400).json({ message: 'Payment type must be partial, full, or balance.' })
  }
  if (!ONLINE_PAYMENT_METHODS.has(paymentMethod)) {
    return res.status(400).json({ message: 'Online checkout supports GCash, Maya, GrabPay, or Card.' })
  }
  if (!Number.isFinite(amount) || amount < 20 || amount > 10000000) {
    return res.status(400).json({ message: 'Online checkout amount must be at least PHP 20.00.' })
  }
  if (notes && notes.length > 500) {
    return res.status(400).json({ message: 'Notes must be 500 characters or fewer.' })
  }

  const cleanAmount = Number(amount.toFixed(2))
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [bRows] = await connection.execute(
      `SELECT b.id, b.client_id, b.gardener_id, b.status, b.booking_stage, b.payment_status,
              b.required_deposit_amount, b.amount_paid,
              COALESCE(a.amount, 0) AS agreed_amount,
              s.title AS service_title,
              CONCAT(c.first_name, ' ', c.last_name) AS client_name,
              c.email AS client_email
       FROM bookings b
       LEFT JOIN agreements a ON a.id = b.agreement_id
       LEFT JOIN services s ON s.id = b.service_id
       JOIN users c ON c.id = b.client_id
       WHERE b.id = ? AND b.client_id = ?
       LIMIT 1
       FOR UPDATE`,
      [bookingId, req.user.id],
    )
    const booking = bRows[0]
    if (!booking) {
      await connection.rollback()
      return res.status(404).json({ message: 'Booking was not found.' })
    }
    if (!['accepted', 'in_progress', 'completed'].includes(booking.status)) {
      await connection.rollback()
      return res.status(409).json({ message: 'Online payments are only accepted for active or completed bookings.' })
    }
    if (booking.payment_status === 'fully_paid') {
      await connection.rollback()
      return res.status(409).json({ message: 'This booking is already fully paid.' })
    }

    const agreedAmount = Number(booking.agreed_amount || 0)
    const alreadyPaid = Number(booking.amount_paid || 0)
    const remainingBalance = Math.max(0, Number((agreedAmount - alreadyPaid).toFixed(2)))
    if (agreedAmount > 0 && cleanAmount > remainingBalance + 0.01) {
      await connection.rollback()
      return res.status(400).json({
        code: 'OVERPAYMENT_EXCEEDS_BALANCE',
        message: `Online payment amount (PHP ${cleanAmount.toFixed(2)}) cannot exceed the remaining balance of PHP ${remainingBalance.toFixed(2)}.`,
      })
    }

    const transactionCode = generateTransactionCode()
    const gatewayCfg = getGatewayConfig()
    if (!gatewayCfg.enabled) {
      await connection.rollback()
      return res.status(503).json({
        code: 'GATEWAY_UNAVAILABLE',
        message: 'Online payment gateway is not configured in this environment.',
      })
    }

    const [ins] = await connection.execute(
      `INSERT INTO booking_payments
        (transaction_code, booking_id, submitted_by, payment_type, payment_method,
         gateway_provider, gateway_status, amount, notes, status)
       VALUES (?, ?, ?, ?, ?, ?, 'awaiting_payment', ?, ?, 'pending')`,
      [transactionCode, bookingId, req.user.id, paymentType, paymentMethod, gatewayCfg.provider, cleanAmount, notes],
    )
    const paymentId = ins.insertId

    const session = await createCheckoutSession({
      bookingId,
      paymentId,
      transactionCode,
      amountPhp: cleanAmount,
      paymentMethod,
      description: `${booking.service_title || 'Gardening service'} (${paymentType} payment)`,
      clientName: booking.client_name,
      clientEmail: booking.client_email,
    })

    await connection.execute(
      `UPDATE booking_payments
       SET gateway_provider = ?, gateway_session_id = ?, gateway_checkout_url = ?
       WHERE id = ?`,
      [session.provider, session.sessionId, session.checkoutUrl, paymentId],
    )

    if (booking.payment_status === 'unpaid') {
      await connection.execute(
        "UPDATE bookings SET payment_status = 'pending_verification' WHERE id = ?",
        [bookingId],
      )
    }

    const [createdRows] = await connection.execute('SELECT * FROM booking_payments WHERE id = ? LIMIT 1', [paymentId])
    await connection.commit()

    return res.status(201).json({
      id: paymentId,
      payment: createdRows[0],
      checkout: {
        provider: session.provider,
        sessionId: session.sessionId,
        checkoutUrl: session.checkoutUrl,
        demoMode: Boolean(session.demoMode),
        amount: cleanAmount,
        paymentMethod,
        paymentType,
        transactionCode,
      },
    })
  } catch (error) {
    await connection.rollback().catch(() => {})
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message })
    return next(error)
  } finally {
    connection.release()
  }
}

async function confirmGatewayPayment(req, res, next) {
  const bookingId = Number(req.params.bookingId)
  const paymentId = Number(req.params.paymentId)
  if (!Number.isInteger(bookingId) || bookingId < 1 || !Number.isInteger(paymentId) || paymentId < 1) {
    return res.status(400).json({ message: 'Valid booking and payment IDs are required.' })
  }

  const demoOutcome = text(req.body?.demoOutcome ?? req.body?.outcome).toLowerCase() || 'paid'
  if (!['paid', 'failed', 'cancelled'].includes(demoOutcome)) {
    return res.status(400).json({ message: 'Outcome must be paid, failed, or cancelled.' })
  }

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [bRows] = await connection.execute(
      `SELECT b.id, b.client_id, b.gardener_id, b.status, b.booking_stage, b.payment_status,
              b.required_deposit_amount, b.amount_paid, b.paid_at, b.transaction_status,
              COALESCE(a.amount, 0) AS agreed_amount
       FROM bookings b
       LEFT JOIN agreements a ON a.id = b.agreement_id
       WHERE b.id = ? AND b.client_id = ?
       LIMIT 1
       FOR UPDATE`,
      [bookingId, req.user.id],
    )
    const booking = bRows[0]
    if (!booking) {
      await connection.rollback()
      return res.status(404).json({ message: 'Booking was not found.' })
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
    if (!['paymongo', 'sandbox_demo'].includes(payment.gateway_provider)) {
      await connection.rollback()
      return res.status(400).json({ message: 'This payment was not created through an online payment gateway.' })
    }

    // Idempotent return if already finalized
    if (payment.status === 'verified') {
      await connection.commit()
      return res.json({
        confirmed: true,
        alreadyProcessed: true,
        payment,
        booking: enrichBookingPaymentFields(booking),
      })
    }
    if (payment.status === 'rejected') {
      await connection.commit()
      return res.json({
        confirmed: false,
        alreadyProcessed: true,
        payment,
        booking: enrichBookingPaymentFields(booking),
      })
    }

    const verification = await verifyCheckoutSession({
      provider: payment.gateway_provider,
      sessionId: payment.gateway_session_id,
      demoOutcome,
    })

    if (verification.paid) {
      await connection.execute(
        `UPDATE booking_payments
         SET status = 'verified',
             gateway_status = 'paid',
             gateway_paid_at = NOW(),
             verified_at = NOW(),
             reference_number = COALESCE(NULLIF(TRIM(reference_number), ''), ?),
             rejection_reason = NULL
         WHERE id = ?`,
        [verification.gatewayReference, paymentId],
      )
    } else if (verification.gatewayStatus === 'awaiting_payment') {
      await connection.commit()
      return res.json({
        confirmed: false,
        awaitingPayment: true,
        payment,
        booking: enrichBookingPaymentFields(booking),
      })
    } else {
      await connection.execute(
        `UPDATE booking_payments
         SET status = 'rejected',
             gateway_status = ?,
             rejection_reason = ?
         WHERE id = ?`,
        [
          verification.gatewayStatus,
          verification.gatewayStatus === 'failed'
            ? 'Online checkout payment failed.'
            : 'Online checkout was cancelled by the client.',
          paymentId,
        ],
      )
    }

    const [[totals]] = await connection.execute(
      `SELECT
         COALESCE(SUM(CASE WHEN status = 'verified' THEN amount ELSE 0 END), 0) AS verified_total,
         SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_count
       FROM booking_payments
       WHERE booking_id = ?`,
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
    const upgradedToBooked = booking.booking_stage !== 'booked' && nextStage === 'booked'
    const nextTxnStatus = (booking.status === 'completed' && nextPaymentStatus === 'fully_paid' && booking.transaction_status === 'open')
      ? 'pending_closure'
      : booking.transaction_status

    await connection.execute(
      `UPDATE bookings
       SET amount_paid = ?,
           payment_status = ?,
           booking_stage = ?,
           transaction_status = ?,
           paid_at = CASE WHEN ? = 'booked' THEN COALESCE(paid_at, NOW()) ELSE paid_at END
       WHERE id = ?`,
      [verifiedTotal, nextPaymentStatus, nextStage, nextTxnStatus, nextStage, bookingId],
    )

    if (verification.paid) {
      const providerLabel = payment.gateway_provider === 'paymongo' ? 'PayMongo Checkout' : 'Online Demo Checkout'
      await createNotification({
        userId: booking.gardener_id,
        type: 'booking_payment',
        title: upgradedToBooked ? 'Online payment confirmed — booking is now paid!' : 'Online payment received',
        message: `Client completed PHP ${Number(payment.amount).toFixed(2)} via ${providerLabel} (${payment.transaction_code}). Total paid: PHP ${verifiedTotal.toFixed(2)}.`,
        entityType: 'booking',
        entityId: bookingId,
        connection,
      })

      const [assignedClerks] = await connection.execute(
        'SELECT clerk_id FROM clerk_gardener_assignments WHERE gardener_id = ?',
        [booking.gardener_id],
      )
      for (const clerkRow of assignedClerks) {
        await createNotification({
          userId: clerkRow.clerk_id,
          type: 'booking_payment',
          title: 'Assigned gardener received online payment',
          message: `Booking #${bookingId} received verified online payment ${payment.transaction_code} of PHP ${Number(payment.amount).toFixed(2)} via ${providerLabel}.`,
          entityType: 'booking',
          entityId: bookingId,
          connection,
        })
      }
    }

    const [updatedPaymentRows] = await connection.execute('SELECT * FROM booking_payments WHERE id = ? LIMIT 1', [paymentId])
    const [updatedBookingRows] = await connection.execute(
      `SELECT b.*, COALESCE(a.amount, 0) AS agreed_amount
       FROM bookings b
       LEFT JOIN agreements a ON a.id = b.agreement_id
       WHERE b.id = ? LIMIT 1`,
      [bookingId],
    )

    await connection.commit()
    return res.json({
      confirmed: Boolean(verification.paid),
      payment: updatedPaymentRows[0],
      booking: enrichBookingPaymentFields(updatedBookingRows[0]),
    })
  } catch (error) {
    await connection.rollback().catch(() => {})
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message })
    return next(error)
  } finally {
    connection.release()
  }
}

module.exports = {
  confirmGatewayPayment,
  confirmTransactionCompletion,
  createBooking,
  createGatewayCheckout,
  createRescheduleRequest,
  getBooking,
  getPaymentGatewayConfig,
  listBookings,
  respondRescheduleRequest,
  sendPaymentReceipt,
  submitPayment,
  updateBookingStatus,
  verifyPayment,
}
