const express = require('express')
const {
  createCategory, getSummary, listActivity, listCategories, listPendingGardeners, listReports, listServices,
  updateCategory, updateGardenerApproval, updateReport, updateServiceStatus, updateUserStatus,
} = require('../controllers/admin.controller')
const { requireAuth, requireRole } = require('../middleware/auth.middleware')

const router = express.Router()

router.use(requireAuth, requireRole('administrator'))
router.get('/summary', getSummary)
router.patch('/users/:userId/status', updateUserStatus)
router.get('/gardeners/pending', listPendingGardeners)
router.patch('/gardeners/:userId/approval', updateGardenerApproval)
router.get('/categories', listCategories)
router.post('/categories', createCategory)
router.patch('/categories/:categoryId', updateCategory)
router.get('/services', listServices)
router.patch('/services/:serviceId/status', updateServiceStatus)
router.get('/activity', listActivity)
router.get('/reports', listReports)
router.patch('/reports/:reportId', updateReport)

module.exports = router
