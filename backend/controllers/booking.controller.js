const { pool } = require('../config/database')
const { createNotification } = require('../services/notification.service')

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function validDateTime(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)
}

async function listBookings(req, res, next) {
  const field = req.user.role === 'client' ? 'b.client_id' : 'b.gardener_id'
  try {
    const [bookings] = await pool.execute(
      `SELECT b.id, b.inquiry_id, b.quotation_id, b.client_id, b.gardener_id,
              b.service_id, b.scheduled_start, b.scheduled_end, b.location,
              b.notes, b.status, b.requested_at, b.updated_at,
              s.title AS service_title,
              CONCAT(client.first_name, ' ', client.last_name) AS client_name,
              gp.business_name AS gardener_name
       FROM bookings b
       LEFT JOIN services s ON s.id = b.service_id
       JOIN users client ON client.id = b.client_id
       JOIN gardener_profiles gp ON gp.user_id = b.gardener_id
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
  try {
    const [bookings] = await pool.execute(
      `SELECT b.id, b.inquiry_id, b.quotation_id, b.client_id, b.gardener_id,
              b.service_id, b.scheduled_start, b.scheduled_end, b.location,
              b.notes, b.status, b.requested_at, b.updated_at,
              s.title AS service_title,
              CONCAT(client.first_name, ' ', client.last_name) AS client_name,
              gp.business_name AS gardener_name
       FROM bookings b
       LEFT JOIN services s ON s.id = b.service_id
       JOIN users client ON client.id = b.client_id
       JOIN gardener_profiles gp ON gp.user_id = b.gardener_id
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

async function createBooking(req, res, next) {
  if (req.user.role !== 'client') return res.status(403).json({ message: 'Only clients can submit booking requests.' })
  const quotationId = Number(req.body.quotationId)
  const serviceId = Number(req.body.serviceId)
  const scheduledStart = text(req.body.scheduledStart)
  const scheduledEnd = text(req.body.scheduledEnd)
  const location = text(req.body.location) || null
  const notes = text(req.body.notes) || null

  const hasQuotation = Number.isInteger(quotationId) && quotationId > 0
  const hasService = Number.isInteger(serviceId) && serviceId > 0
  if (hasQuotation === hasService) return res.status(400).json({ message: 'Provide either an accepted quotation or an eligible service for booking.' })
  if (!validDateTime(scheduledStart) || !validDateTime(scheduledEnd)) return res.status(400).json({ message: 'A start and end date/time are required.' })
  if (new Date(scheduledEnd) <= new Date(scheduledStart)) return res.status(400).json({ message: 'The booking end must be after the start.' })
  if (!location || location.length > 255) return res.status(400).json({ message: 'A valid service location is required.' })
  if (notes && notes.length > 5000) return res.status(400).json({ message: 'Booking notes are too long.' })

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    let bookingSource
    if (hasQuotation) {
      const [quotations] = await connection.execute(
        `SELECT q.id, q.inquiry_id, q.gardener_id, q.status,
                i.client_id, i.service_id
         FROM quotations q JOIN inquiries i ON i.id = q.inquiry_id
         WHERE q.id = ? AND i.client_id = ? FOR UPDATE`,
        [quotationId, req.user.id],
      )
      const quotation = quotations[0]
      if (!quotation || quotation.status !== 'accepted') {
        await connection.rollback()
        return res.status(409).json({ message: 'Only an accepted quotation can be booked.' })
      }
      const [existing] = await connection.execute(
        'SELECT id FROM bookings WHERE quotation_id = ? AND status NOT IN ("declined", "cancelled") LIMIT 1',
        [quotationId],
      )
      if (existing[0]) {
        await connection.rollback()
        return res.status(409).json({ message: 'This quotation already has a booking.' })
      }
      bookingSource = {
        inquiryId: quotation.inquiry_id,
        quotationId: quotation.id,
        gardenerId: quotation.gardener_id,
        serviceId: quotation.service_id,
        message: 'A client submitted a booking request for your accepted quotation.',
      }
    } else {
      const [services] = await connection.execute(
        `SELECT s.id, s.gardener_id
         FROM services s
         JOIN users u ON u.id = s.gardener_id AND u.is_active = TRUE
         JOIN gardener_profiles gp ON gp.user_id = u.id AND gp.is_approved = TRUE
         JOIN service_categories c ON c.id = s.category_id AND c.is_active = TRUE
         WHERE s.id = ? AND s.is_active = TRUE AND s.indicative_price IS NOT NULL
         LIMIT 1 FOR UPDATE`,
        [serviceId],
      )
      if (!services[0]) {
        await connection.rollback()
        return res.status(409).json({ message: 'This service is not eligible for direct booking. Please send an inquiry instead.' })
      }
      bookingSource = {
        inquiryId: null,
        quotationId: null,
        gardenerId: services[0].gardener_id,
        serviceId: services[0].id,
        message: 'A client submitted a direct booking request for your service.',
      }
    }

    const [conflicts] = await connection.execute(
      `SELECT id FROM bookings
       WHERE gardener_id = ? AND status IN ('pending', 'accepted', 'in_progress')
         AND scheduled_start < ? AND scheduled_end > ?
       LIMIT 1`,
      [bookingSource.gardenerId, scheduledEnd.replace('T', ' '), scheduledStart.replace('T', ' ')],
    )
    if (conflicts[0]) {
      await connection.rollback()
      return res.status(409).json({ message: 'The gardener already has a booking during that time.' })
    }

    const [result] = await connection.execute(
      `INSERT INTO bookings
       (inquiry_id, quotation_id, client_id, gardener_id, service_id, scheduled_start, scheduled_end, location, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [bookingSource.inquiryId, bookingSource.quotationId, req.user.id, bookingSource.gardenerId, bookingSource.serviceId, scheduledStart.replace('T', ' '), scheduledEnd.replace('T', ' '), location, notes],
    )
    await createNotification({
      userId: bookingSource.gardenerId,
      type: 'new_booking',
      title: 'New booking request',
      message: bookingSource.message,
      entityType: 'booking',
      entityId: result.insertId,
      connection,
    })
    await connection.commit()
    return res.status(201).json({ id: result.insertId, status: 'pending' })
  } catch (error) {
    await connection.rollback()
    return next(error)
  } finally {
    connection.release()
  }
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
