const express = require('express')
const {
  confirmGatewayPayment,
  confirmTransactionCompletion,
  createBooking,
  createGatewayCheckout,
  createRescheduleRequest,
  getBooking,
  getPaymentGatewayConfig,
  listBookings,
  respondRescheduleRequest,
  sendPaymentReceipt,
  submitPayment,
  updateBookingStatus,
  verifyPayment,
} = require('../controllers/booking.controller')
const { requireAuth, requireRole } = require('../middleware/auth.middleware')
const { requestImageUpload } = require('../middleware/upload.middleware')

const router = express.Router()

router.use(requireAuth)
router.get('/payment-gateway/config', requireRole('client', 'gardener', 'clerk', 'administrator'), getPaymentGatewayConfig)
router.get('/', requireRole('client', 'gardener'), listBookings)
router.post('/', createBooking)
router.get('/:bookingId', requireRole('client', 'gardener'), getBooking)
router.patch('/:bookingId/status', requireRole('client', 'gardener'), updateBookingStatus)
router.post('/:bookingId/complete-transaction', requireRole('client', 'gardener'), confirmTransactionCompletion)
router.post('/:bookingId/reschedule-requests', requireRole('client', 'gardener'), createRescheduleRequest)
router.patch('/:bookingId/reschedule-requests/:requestId', requireRole('client', 'gardener'), respondRescheduleRequest)
router.post('/:bookingId/payments/checkout', requireRole('client'), createGatewayCheckout)
router.post('/:bookingId/payments/:paymentId/confirm-gateway', requireRole('client'), confirmGatewayPayment)
router.post('/:bookingId/payments', requireRole('client'), requestImageUpload.single('receipt'), submitPayment)
router.patch('/:bookingId/payments/:paymentId', requireRole('gardener'), verifyPayment)
router.get('/:bookingId/payments/:paymentId/receipt', requireRole('client', 'gardener', 'clerk', 'administrator'), sendPaymentReceipt)

module.exports = router
