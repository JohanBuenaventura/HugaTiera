const cors = require('cors')
const cookieParser = require('cookie-parser')
const express = require('express')
const authRoutes = require('./routes/auth.routes')
const aiRoutes = require('./routes/ai.routes')
const bookingRoutes = require('./routes/booking.routes')
const conversationRoutes = require('./routes/conversation.routes')
const adminRoutes = require('./routes/admin.routes')
const healthRoutes = require('./routes/health.routes')
const inquiryRoutes = require('./routes/inquiry.routes')
const gardenerRoutes = require('./routes/gardener.routes')
const portfolioRoutes = require('./routes/portfolio.routes')
const profileRoutes = require('./routes/profile.routes')
const reviewRoutes = require('./routes/review.routes')
const serviceRoutes = require('./routes/service.routes')
const notificationRoutes = require('./routes/notification.routes')

const app = express()

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
app.use('/api/bookings', bookingRoutes)
app.use('/api/reviews', reviewRoutes)
app.use('/api/conversations', conversationRoutes)
app.use('/api/notifications', notificationRoutes)

app.use((error, req, res, next) => {
  console.error(error)
  if (error.code === 'LIMIT_FILE_SIZE' || error.message === 'Only JPEG, PNG, and WebP images are allowed.') {
    return res.status(400).json({ message: error.code === 'LIMIT_FILE_SIZE' ? 'Portfolio image must be 5 MB or smaller.' : error.message })
  }
  if (error.message === 'JWT_SECRET is not configured.') {
    return res.status(500).json({ message: 'Backend authentication is not configured. Set JWT_SECRET in backend/.env and restart the server.' })
  }
  if (error.code === 'ER_BAD_DB_ERROR' || error.code === 'ECONNREFUSED') {
    return res.status(503).json({ message: 'The backend cannot connect to MySQL. Check that MySQL is running and the database settings are correct.' })
  }
  res.status(503).json({
    status: 'error',
    message: 'A backend dependency is unavailable.',
  })
})

module.exports = app