const express = require('express')
const {
  createBooking,
  getBooking,
  listBookings,
  updateBookingStatus,
} = require('../controllers/booking.controller')
const { requireAuth } = require('../middleware/auth.middleware')

const router = express.Router()

router.use(requireAuth)
router.get('/', listBookings)
router.post('/', createBooking)
router.get('/:bookingId', getBooking)
router.patch('/:bookingId/status', updateBookingStatus)

module.exports = router
