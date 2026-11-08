const { pool } = require('../config/database')
const { createNotification } = require('../services/notification.service')

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

async function listGardenerReviews(req, res, next) {
  try {
    const [reviews] = await pool.execute(
      `SELECT r.id, r.booking_id, r.rating, r.review_text, r.created_at,
              CONCAT(u.first_name, ' ', u.last_name) AS client_name
       FROM reviews r
       JOIN users u ON u.id = r.client_id
       WHERE r.gardener_id = ? AND r.is_visible = TRUE
       ORDER BY r.created_at DESC`,
      [Number(req.params.gardenerId)],
    )
    return res.json({ reviews })
  } catch (error) {
    return next(error)
  }
}

async function getBookingReview(req, res, next) {
  try {
    const [reviews] = await pool.execute(
      `SELECT r.id, r.booking_id, r.rating, r.review_text, r.created_at
       FROM reviews r JOIN bookings b ON b.id = r.booking_id
       WHERE r.booking_id = ? AND (b.client_id = ? OR b.gardener_id = ?)`,
      [Number(req.params.bookingId), req.user.id, req.user.id],
    )
    return res.json({ review: reviews[0] || null })
  } catch (error) {
    return next(error)
  }
}

async function createReview(req, res, next) {
  const bookingId = Number(req.body.bookingId)
  const rating = Number(req.body.rating)
  const reviewText = text(req.body.reviewText) || null
  if (!Number.isInteger(bookingId) || bookingId < 1) return res.status(400).json({ message: 'A valid completed booking is required.' })
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(400).json({ message: 'Rating must be a whole number from 1 to 5.' })
  if (reviewText && reviewText.length > 2000) return res.status(400).json({ message: 'Review text must be 2,000 characters or fewer.' })

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [bookings] = await connection.execute(
      `SELECT id, gardener_id FROM bookings
       WHERE id = ? AND client_id = ? AND status = 'completed' FOR UPDATE`,
      [bookingId, req.user.id],
    )
    if (!bookings[0]) {
      await connection.rollback()
      return res.status(409).json({ message: 'Only your completed bookings can be reviewed.' })
    }
    const [existing] = await connection.execute('SELECT id FROM reviews WHERE booking_id = ? LIMIT 1', [bookingId])
    if (existing[0]) {
      await connection.rollback()
      return res.status(409).json({ message: 'This booking has already been reviewed.' })
    }
    const [result] = await connection.execute(
      'INSERT INTO reviews (booking_id, client_id, gardener_id, rating, review_text) VALUES (?, ?, ?, ?, ?)',
      [bookingId, req.user.id, bookings[0].gardener_id, rating, reviewText],
    )
    await createNotification({
      userId: bookings[0].gardener_id,
      type: 'new_review',
      title: 'New review received',
      message: 'A client submitted a review for your completed service.',
      entityType: 'review',
      entityId: result.insertId,
      connection,
    })
    await connection.commit()
    return res.status(201).json({ id: result.insertId })
  } catch (error) {
    await connection.rollback()
    return next(error)
  } finally {
    connection.release()
  }
}

module.exports = { createReview, getBookingReview, listGardenerReviews }
