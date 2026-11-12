const { pool } = require('../config/database')
const { createNotification } = require('../services/notification.service')

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function validDateTime(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)
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
              b.notes, b.status, b.requested_at, b.updated_at,
              s.title AS service_title,
              a.version AS agreement_version,
              a.amount AS agreed_amount,
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
    return res.json({ bookings })
  } catch (error) {
    return next(error)
  }
}

async function getBooking(req, res, next) {
  if (!['client', 'gardener'].includes(req.user.role)) {
    return res.status(403).json({ message: 'You do not have permission to access this resource.' })
  }
  try {
    const [bookings] = await pool.execute(
      `SELECT b.id, b.inquiry_id, b.quotation_id, b.agreement_id, b.client_id, b.gardener_id,
              b.service_id, b.scheduled_start, b.scheduled_end, b.location,
              b.notes, b.status, b.requested_at, b.updated_at,
              s.title AS service_title,
              a.version AS agreement_version,
              a.amount AS agreed_amount,
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
      [Number(req.params.bookingId), req.user.id, req.user.id],
    )
    if (!bookings[0]) return res.status(404).json({ message: 'Booking was not found.' })
    return res.json({ booking: bookings[0] })
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
    message: 'Direct booking creation is not allowed. A confirmed booking is created automatically only after both the client and the gardener approve the same mutual agreement version.',
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
      `SELECT id, client_id, gardener_id FROM bookings
       WHERE id = ? AND ${ownerField} = ? AND status IN (${allowed.map(() => '?').join(',')}) FOR UPDATE`,
      [Number(req.params.bookingId), req.user.id, ...allowed],
    )
    if (!rows[0]) {
      await connection.rollback()
      return res.status(409).json({ message: 'Booking was not found or the status transition is no longer available.' })
    }
    if (status === 'accepted') {
      const [conflicts] = await connection.execute(
        `SELECT id FROM bookings
         WHERE gardener_id = ? AND id <> ? AND status IN ('accepted', 'in_progress')
           AND scheduled_start < (SELECT scheduled_end FROM bookings WHERE id = ?)
           AND scheduled_end > (SELECT scheduled_start FROM bookings WHERE id = ?)
         LIMIT 1`,
        [rows[0].gardener_id, rows[0].id, rows[0].id, rows[0].id],
      )
      if (conflicts[0]) {
        await connection.rollback()
        return res.status(409).json({ message: 'The gardener already has an accepted booking during that time.' })
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

module.exports = {
  createBooking,
  getBooking,
  listBookings,
  updateBookingStatus,
}
