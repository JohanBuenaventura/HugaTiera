const express = require('express')
const {
  createBooking,
  getBooking,
  listBookings,
  sendPaymentReceipt,
  submitPayment,
  updateBookingStatus,
  verifyPayment,
} = require('../controllers/booking.controller')
const { requireAuth, requireRole } = require('../middleware/auth.middleware')
const { requestImageUpload } = require('../middleware/upload.middleware')

const router = express.Router()

router.use(requireAuth)
router.get('/', requireRole('client', 'gardener'), listBookings)
router.post('/', createBooking)
router.get('/:bookingId', requireRole('client', 'gardener'), getBooking)
router.patch('/:bookingId/status', requireRole('client', 'gardener'), updateBookingStatus)
router.post('/:bookingId/payments', requireRole('client'), requestImageUpload.single('receipt'), submitPayment)
router.patch('/:bookingId/payments/:paymentId', requireRole('gardener'), verifyPayment)
router.get('/:bookingId/payments/:paymentId/receipt', requireRole('client', 'gardener', 'administrator'), sendPaymentReceipt)

module.exports = router
