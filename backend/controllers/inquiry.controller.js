const { pool } = require('../config/database')
const { createNotification } = require('../services/notification.service')

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function validDate(value) {
  return !value || /^\d{4}-\d{2}-\d{2}$/.test(value)
}

async function listInquiries(req, res, next) {
  const field = req.user.role === 'client' ? 'i.client_id' : 'i.gardener_id'
  try {
    const [inquiries] = await pool.execute(`
      SELECT i.id, i.subject, i.description, i.requested_date, i.location, i.status,
             i.created_at, i.updated_at, s.title AS service_title,
             u.first_name AS client_first_name, u.last_name AS client_last_name,
             gp.business_name
      FROM inquiries i
      LEFT JOIN services s ON s.id = i.service_id
      JOIN users u ON u.id = i.client_id
      JOIN gardener_profiles gp ON gp.user_id = i.gardener_id
      WHERE ${field} = ?
      ORDER BY i.updated_at DESC
    `, [req.user.id])
    return res.json({ inquiries })
  } catch (error) {
    return next(error)
  }
}

async function getInquiry(req, res, next) {
  try {
    const [inquiries] = await pool.execute(`
      SELECT i.id, i.client_id, i.gardener_id, i.service_id, i.subject, i.description,
             i.requested_date, i.location, i.status, i.created_at, i.updated_at,
             s.title AS service_title, u.first_name AS client_first_name,
             u.last_name AS client_last_name, gp.business_name
      FROM inquiries i
      LEFT JOIN services s ON s.id = i.service_id
      JOIN users u ON u.id = i.client_id
      JOIN gardener_profiles gp ON gp.user_id = i.gardener_id
      WHERE i.id = ? AND (i.client_id = ? OR i.gardener_id = ?)
      LIMIT 1
    `, [Number(req.params.inquiryId), req.user.id, req.user.id])
    if (!inquiries[0]) return res.status(404).json({ message: 'Inquiry was not found.' })

    const [quotations] = await pool.execute(
      'SELECT id, amount, details, availability_start, availability_end, status, valid_until, created_at, updated_at FROM quotations WHERE inquiry_id = ? ORDER BY created_at DESC',
      [inquiries[0].id],
    )
    return res.json({ inquiry: inquiries[0], quotations })
  } catch (error) {
    return next(error)
  }
}

async function createInquiry(req, res, next) {
  const serviceId = Number(req.body.serviceId)
  const subject = text(req.body.subject)
  const description = text(req.body.description)
  const requestedDate = text(req.body.requestedDate) || null
  const location = text(req.body.location) || null

  if (!Number.isInteger(serviceId) || serviceId < 1) return res.status(400).json({ message: 'A valid service is required.' })
  if (!subject || subject.length > 200) return res.status(400).json({ message: 'A subject between 1 and 200 characters is required.' })
  if (!description) return res.status(400).json({ message: 'Please describe what you need.' })
  if (!validDate(requestedDate)) return res.status(400).json({ message: 'Requested date must use YYYY-MM-DD format.' })
  if (location && location.length > 255) return res.status(400).json({ message: 'Location is too long.' })

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [services] = await connection.execute(`
      SELECT s.id, s.gardener_id
      FROM services s
      JOIN users u ON u.id = s.gardener_id AND u.is_active = TRUE
      JOIN gardener_profiles gp ON gp.user_id = s.gardener_id AND gp.is_approved = TRUE
      WHERE s.id = ? AND s.is_active = TRUE
      LIMIT 1
    `, [serviceId])
    if (!services[0]) return res.status(404).json({ message: 'Service is unavailable.' })

    const [result] = await connection.execute(
      'INSERT INTO inquiries (client_id, gardener_id, service_id, subject, description, requested_date, location) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [req.user.id, services[0].gardener_id, serviceId, subject, description, requestedDate, location],
    )
    await createNotification({
      userId: services[0].gardener_id,
      type: 'new_inquiry',
      title: 'New service inquiry',
      message: `A client sent an inquiry: ${subject}`,
      entityType: 'inquiry',
      entityId: result.insertId,
      connection,
    })
    await connection.commit()
    return res.status(201).json({ id: result.insertId, status: 'open' })
  } catch (error) {
    await connection.rollback()
    return next(error)
  } finally {
    connection.release()
  }
}

async function createQuotation(req, res, next) {
  const inquiryId = Number(req.params.inquiryId)
  const amount = req.body.amount === '' || req.body.amount === null ? null : Number(req.body.amount)
  const details = text(req.body.details)
  const availabilityStart = text(req.body.availabilityStart) || null
  const availabilityEnd = text(req.body.availabilityEnd) || null
  const validUntil = text(req.body.validUntil) || null

  if (!details) return res.status(400).json({ message: 'Quotation details are required.' })
  if (amount !== null && (!Number.isFinite(amount) || amount < 0)) return res.status(400).json({ message: 'Quotation amount must be a positive number.' })
  if (![availabilityStart, availabilityEnd, validUntil].every(validDate)) return res.status(400).json({ message: 'Quotation dates must use YYYY-MM-DD format.' })

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [inquiries] = await connection.execute(
      'SELECT id, status, client_id FROM inquiries WHERE id = ? AND gardener_id = ? FOR UPDATE',
      [inquiryId, req.user.id],
    )
    if (!inquiries[0]) {
      await connection.rollback()
      return res.status(404).json({ message: 'Inquiry was not found or is not assigned to you.' })
    }
    if (['closed', 'cancelled'].includes(inquiries[0].status)) {
      await connection.rollback()
      return res.status(409).json({ message: 'This inquiry is no longer accepting quotations.' })
    }
    const [result] = await connection.execute(
      'INSERT INTO quotations (inquiry_id, gardener_id, amount, details, availability_start, availability_end, status, valid_until) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [inquiryId, req.user.id, amount, details, availabilityStart, availabilityEnd, 'sent', validUntil],
    )
    await connection.execute("UPDATE inquiries SET status = 'responded' WHERE id = ?", [inquiryId])
    await createNotification({
      userId: inquiries[0].client_id,
      type: 'new_quotation',
      title: 'New quotation received',
      message: 'A gardener sent an indicative quotation for your inquiry.',
      entityType: 'inquiry',
      entityId: inquiryId,
      connection,
    })
    await connection.commit()
    return res.status(201).json({ id: result.insertId, status: 'sent' })
  } catch (error) {
    await connection.rollback()
    return next(error)
  } finally {
    connection.release()
  }
}

async function updateQuotationStatus(req, res, next) {
  const quotationId = Number(req.params.quotationId)
  const status = text(req.body.status)
  if (!['accepted', 'declined'].includes(status)) return res.status(400).json({ message: 'Quotation status must be accepted or declined.' })

  try {
    const [quotations] = await pool.execute(`
      SELECT q.id, q.inquiry_id, i.gardener_id
      FROM quotations q JOIN inquiries i ON i.id = q.inquiry_id
      WHERE q.id = ? AND i.client_id = ? AND q.status = 'sent'
      LIMIT 1
    `, [quotationId, req.user.id])
    if (!quotations[0]) return res.status(404).json({ message: 'Quotation was not found or is no longer available.' })
    const [result] = await pool.execute(`
      UPDATE quotations q
      JOIN inquiries i ON i.id = q.inquiry_id
      SET q.status = ?
      WHERE q.id = ? AND i.client_id = ? AND q.status = 'sent'
    `, [status, quotationId, req.user.id])
    if (!result.affectedRows) return res.status(404).json({ message: 'Quotation was not found or is no longer available.' })
    await createNotification({
      userId: quotations[0].gardener_id,
      type: 'quotation_status',
      title: `Quotation ${status}`,
      message: `The client ${status} your quotation.`,
      entityType: 'inquiry',
      entityId: quotations[0].inquiry_id,
    })
    return res.json({ status })
  } catch (error) {
    return next(error)
  }
}

async function updateInquiryStatus(req, res, next) {
  const status = text(req.body.status)
  if (!['closed', 'cancelled'].includes(status)) return res.status(400).json({ message: 'Inquiry status must be closed or cancelled.' })
  try {
    const [result] = await pool.execute(
      'UPDATE inquiries SET status = ? WHERE id = ? AND (client_id = ? OR gardener_id = ?) AND status NOT IN ("closed", "cancelled")',
      [status, Number(req.params.inquiryId), req.user.id, req.user.id],
    )
    if (!result.affectedRows) return res.status(404).json({ message: 'Inquiry was not found or is already closed.' })
    return res.json({ status })
  } catch (error) {
    return next(error)
  }
}

module.exports = {
  createInquiry,
  createQuotation,
  getInquiry,
  listInquiries,
  updateInquiryStatus,
  updateQuotationStatus,
}
