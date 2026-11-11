const crypto = require('crypto')
const cors = require('cors')
const cookieParser = require('cookie-parser')
const express = require('express')
const authRoutes = require('./routes/auth.routes')
const agreementRoutes = require('./routes/agreement.routes')
const aiRoutes = require('./routes/ai.routes')
const bookingRoutes = require('./routes/booking.routes')
const conversationRoutes = require('./routes/conversation.routes')
const adminRoutes = require('./routes/admin.routes')
const healthRoutes = require('./routes/health.routes')
const inquiryRoutes = require('./routes/inquiry.routes')
const gardenerRoutes = require('./routes/gardener.routes')
const portfolioRoutes = require('./routes/portfolio.routes')
const profileRoutes = require('./routes/profile.routes')
const requestImageRoutes = require('./routes/requestImage.routes')
const reviewRoutes = require('./routes/review.routes')
const serviceRoutes = require('./routes/service.routes')
const notificationRoutes = require('./routes/notification.routes')

const app = express()

const dbUnavailableCodes = new Set([
  'ER_BAD_DB_ERROR',
  'ECONNREFUSED',
  'PROTOCOL_CONNECTION_LOST',
  'ETIMEDOUT',
  'EACCES',
  'ER_ACCESS_DENIED_ERROR',
])

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}))
app.use(express.json())
app.use(cookieParser())

app.use('/api/health', healthRoutes)
app.use('/api/auth', authRoutes)
app.use('/api/ai', aiRoutes)
app.use('/api/profiles', profileRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/services', serviceRoutes)
app.use('/api/gardeners', gardenerRoutes)
app.use('/api/portfolios', portfolioRoutes)
app.use('/api/inquiries', inquiryRoutes)
app.use('/api/agreements', agreementRoutes)
app.use('/api/request-images', requestImageRoutes)
app.use('/api/bookings', bookingRoutes)
app.use('/api/reviews', reviewRoutes)
app.use('/api/conversations', conversationRoutes)
app.use('/api/notifications', notificationRoutes)

app.use((error, req, res, next) => {
  const requestId = crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Date.now().toString(36)
  console.error(`[${requestId}]`, error)

  if (error.type === 'entity.parse.failed' || error instanceof SyntaxError) {
    return res.status(400).json({ message: 'Invalid JSON request payload.', requestId })
  }
  if (
    error.code === 'LIMIT_FILE_SIZE'
    || error.code === 'LIMIT_FILE_COUNT'
    || error.code === 'LIMIT_UNEXPECTED_FILE'
    || error.message === 'Only JPEG, PNG, and WebP images are allowed.'
  ) {
    let message = error.message
    if (error.code === 'LIMIT_FILE_SIZE') {
      message = 'Uploaded image must be 5 MB or smaller.'
    } else if (error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE') {
      message = 'Only one image file may be uploaded per request.'
    }
    return res.status(400).json({ message })
  }
  if (error.message === 'JWT_SECRET is not configured.') {
    return res.status(500).json({ message: 'Backend authentication is not configured. Set JWT_SECRET in backend/.env and restart the server.', requestId })
  }
  if (dbUnavailableCodes.has(error.code)) {
    return res.status(503).json({
      status: 'error',
      code: 'DATABASE_UNAVAILABLE',
      message: 'The backend cannot connect to MySQL. Check that MySQL is running and the database settings are correct.',
      requestId,
    })
  }
  return res.status(500).json({
    status: 'error',
    code: 'INTERNAL_ERROR',
    message: 'An unexpected server error occurred. Please try again.',
    requestId,
  })
})

module.exports = app