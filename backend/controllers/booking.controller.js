const { pool } = require('../config/database')
const { createNotification } = require('../services/notification.service')
const {
  paymentReceiptsDirectory,
  processAndSavePaymentReceipt,
  removeFileIfExists,
  resolveContainedPath,
} = require('../middleware/upload.middleware')
const { validateGardenerSchedule } = require('../utils/scheduling')

const ALLOWED_PAYMENT_TYPES = new Set(['partial', 'full', 'balance'])
const ALLOWED_PAYMENT_METHODS = new Set(['gcash', 'maya', 'bank_transfer', 'cash', 'other'])

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function enrichBookingPaymentFields(row) {
  const agreedAmount = row.agreed_amount !== null && row.agreed_amount !== undefined ? Number(row.agreed_amount) : 0
  const amountPaid = Number(row.amount_paid || 0)
  const requiredDeposit = Number(row.required_deposit_amount || 0)
  const remainingBalance = Math.max(0, Number((agreedAmount - amountPaid).toFixed(2)))
  return {
    ...row,
    booking_stage: row.booking_stage || 'reserved',
    payment_status: row.payment_status || 'unpaid',
    required_deposit_amount: requiredDeposit,
    amount_paid: amountPaid,
    remaining_balance: remainingBalance,
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
              b.requested_at, b.updated_at,
              s.title AS service_title,
              a.version AS agreement_version,
              a.amount AS agreed_amount,
              a.required_deposit_amount AS agreed_deposit_amount,
              a.scope_of_work AS agreed_scope,
              CONCAT(client.first_name, ' ', client.last_name) AS client_name,
              COALESCE(NULLIF(TRIM(gp.business_name), ''), CONCAT(gardener.first_name, ' ', gardener.last_name)) AS gardener_name
       FROM bookings b
       LEFT JOIN services s ON s.id = b.service_id
       LEFT JOIN agreements a ON a.id = b.agreement_id
       JOIN users client ON client.id = b.client_id
       JOIN users gardener ON gardener.id = b.gardener_id
       LEFT JOIN gardener_profiles gp ON gp.user_id = b.gardener_id
       WHERE ${field} = ?
       ORDER BY b.updated_at DESC`,
      [req.user.id],
    )
    return res.json({ bookings: bookings.map(enrichBookingPaymentFields) })
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
              COALESCE(NULLIF(TRIM(gp.business_name), ''), CONCAT(gardener.first_name, ' ', gardener.last_name)) AS gardener_name
       FROM bookings b
       LEFT JOIN services s ON s.id = b.service_id
       LEFT JOIN agreements a ON a.id = b.agreement_id
       JOIN users client ON client.id = b.client_id
       JOIN users gardener ON gardener.id = b.gardener_id
       LEFT JOIN gardener_profiles gp ON gp.user_id = b.gardener_id
       WHERE b.id = ? AND (b.client_id = ? OR b.gardener_id = ?)
       LIMIT 1`,
      [bookingId, req.user.id, req.user.id],
    )
    if (!bookings[0]) return res.status(404).json({ message: 'Booking was not found.' })

    const [payments] = await pool.execute(
      `SELECT p.id, p.booking_id, p.submitted_by, p.payment_type, p.payment_method,
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

    return res.json({
      booking: enrichBookingPaymentFields(bookings[0]),
      payments,
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
  },
  client: { cancelled: ['pending', 'accepted'] },
}

async function updateBookingStatus(req, res, next) {
  if (!['client', 'gardener'].includes(req.user.role)) {
    return res.status(403).json({ message: 'You do not have permission to access this resource.' })
  }
  const status = text(req.body.status)
  const role = req.user.role
  if (!transitions[role] || !transitions[role][status]) return res.status(400).json({ message: 'This booking status transition is not allowed.' })
  const allowed = transitions[role][status]
  const ownerField = role === 'client' ? 'client_id' : 'gardener_id'
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [rows] = await connection.execute(
      `SELECT id, client_id, gardener_id, scheduled_start, scheduled_end,
              booking_stage, payment_status, required_deposit_amount, amount_paid
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
    await connection.execute('UPDATE bookings SET status = ? WHERE id = ?', [status, rows[0].id])
    const recipientId = role === 'client' ? rows[0].gardener_id : rows[0].client_id
    await createNotification({
      userId: recipientId,
      type: 'booking_status',
      title: 'Booking status updated',
      message: `Your booking is now ${status.replace('_', ' ')}.`,
      entityType: 'booking',
      entityId: rows[0].id,
      connection,
    })
    await connection.commit()
    return res.json({ status })
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
    if (!['accepted', 'in_progress'].includes(booking.status)) {
      await connection.rollback()
      if (savedReceipt) await removeFileIfExists(paymentReceiptsDirectory, savedReceipt.relativePath)
      return res.status(409).json({ message: 'Payments can only be submitted for active reservations or bookings.' })
    }
    if (booking.payment_status === 'fully_paid') {
      await connection.rollback()
      if (savedReceipt) await removeFileIfExists(paymentReceiptsDirectory, savedReceipt.relativePath)
      return res.status(409).json({ message: 'This booking is already fully paid.' })
    }

    const cleanAmount = Number(amount.toFixed(2))
    const [ins] = await connection.execute(
      `INSERT INTO booking_payments
        (booking_id, submitted_by, payment_type, payment_method, amount, reference_number, receipt_path, notes, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
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
      `SELECT b.id, b.client_id, b.gardener_id, b.booking_stage, b.payment_status,
              b.required_deposit_amount, b.amount_paid, b.paid_at,
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

    await connection.execute(
      `UPDATE bookings
       SET amount_paid = ?,
           payment_status = ?,
           booking_stage = ?,
           paid_at = CASE WHEN ? = 'booked' THEN COALESCE(paid_at, NOW()) ELSE paid_at END
       WHERE id = ?`,
      [verifiedTotal, nextPaymentStatus, nextStage, nextStage, bookingId],
    )

    await createNotification({
      userId: booking.client_id,
      type: 'booking_payment',
      title: decision === 'verified'
        ? (upgradedToBooked ? 'Booking confirmed — payment verified!' : 'Payment verified')
        : 'Payment proof rejected',
      message: decision === 'verified'
        ? (upgradedToBooked
          ? `Your payment of PHP ${Number(payment.amount).toFixed(2)} was verified. Your reservation is now a confirmed paid booking!`
          : `Your payment of PHP ${Number(payment.amount).toFixed(2)} was verified. Total paid: PHP ${verifiedTotal.toFixed(2)}.`)
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
    const isAllowed = req.user.role === 'administrator'
      || row.client_id === req.user.id
      || row.gardener_id === req.user.id
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

module.exports = {
  createBooking,
  getBooking,
  listBookings,
  sendPaymentReceipt,
  submitPayment,
  updateBookingStatus,
  verifyPayment,
}
