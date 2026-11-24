const express = require('express')
const {
  addAssignedGardenerUnavailableDate,
  createAssignedGardenerService,
  getClerkWorkspace,
  removeAssignedGardenerUnavailableDate,
  toggleAssignedGardenerService,
  updateAssignedGardenerSchedule,
  verifyAssignedGardenerPayment,
} = require('../controllers/clerk.controller')
const { requireAuth, requireRole } = require('../middleware/auth.middleware')

const router = express.Router()

router.use(requireAuth, requireRole('clerk'))
router.get('/workspace', getClerkWorkspace)
router.put('/gardeners/:gardenerId/schedule', updateAssignedGardenerSchedule)
router.post('/gardeners/:gardenerId/unavailable-dates', addAssignedGardenerUnavailableDate)
router.delete('/gardeners/:gardenerId/unavailable-dates/:blockId', removeAssignedGardenerUnavailableDate)
router.post('/gardeners/:gardenerId/services', createAssignedGardenerService)
router.patch('/gardeners/:gardenerId/services/:serviceId/status', toggleAssignedGardenerService)
router.patch('/gardeners/:gardenerId/bookings/:bookingId/payments/:paymentId', verifyAssignedGardenerPayment)

module.exports = router
