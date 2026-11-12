const express = require('express')
const {
  createBooking,
  getBooking,
  listBookings,
  updateBookingStatus,
} = require('../controllers/booking.controller')
const { requireAuth, requireRole } = require('../middleware/auth.middleware')

const router = express.Router()

router.use(requireAuth)
router.get('/', requireRole('client', 'gardener'), listBookings)
router.post('/', createBooking)
router.get('/:bookingId', requireRole('client', 'gardener'), getBooking)
router.patch('/:bookingId/status', requireRole('client', 'gardener'), updateBookingStatus)

module.exports = router
