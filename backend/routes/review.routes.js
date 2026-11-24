const express = require('express')
const { createReview, getBookingReview, listGardenerReviews, listRecentReviews } = require('../controllers/review.controller')
const { requireAuth, requireRole } = require('../middleware/auth.middleware')

const router = express.Router()

router.get('/recent', listRecentReviews)
router.get('/gardeners/:gardenerId', listGardenerReviews)
router.use(requireAuth)
router.get('/bookings/:bookingId', getBookingReview)
router.post('/', requireRole('client'), createReview)

module.exports = router
