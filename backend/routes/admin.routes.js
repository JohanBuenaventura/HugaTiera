const express = require('express')
const {
  createCategory, createPricingAddon, deleteUser, getSummary, listActivity, listCategories, listPendingGardeners,
  listPricingAddons, listReports, listServices,
  updateCategory, updateGardenerApproval, updatePricingAddon, updateReport, updateServiceStatus, updateUser, updateUserStatus,
} = require('../controllers/admin.controller')
const { requireAuth, requireRole } = require('../middleware/auth.middleware')

const router = express.Router()

router.use(requireAuth, requireRole('administrator'))
router.get('/summary', getSummary)
router.patch('/users/:userId', updateUser)
router.patch('/users/:userId/status', updateUserStatus)
router.delete('/users/:userId', deleteUser)
router.get('/gardeners/pending', listPendingGardeners)
router.patch('/gardeners/:userId/approval', updateGardenerApproval)
router.get('/categories', listCategories)
router.post('/categories', createCategory)
router.patch('/categories/:categoryId', updateCategory)
router.get('/pricing-addons', listPricingAddons)
router.post('/pricing-addons', createPricingAddon)
router.patch('/pricing-addons/:addonId', updatePricingAddon)
router.get('/services', listServices)
router.patch('/services/:serviceId/status', updateServiceStatus)
router.get('/activity', listActivity)
router.get('/reports', listReports)
router.patch('/reports/:reportId', updateReport)

module.exports = router
