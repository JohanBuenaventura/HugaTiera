const express = require('express')
const {
  createService,
  deactivateService,
  deleteServiceImage,
  getService,
  listCategories,
  listMyServices,
  listPricingAddons,
  listServices,
  sendServiceImage,
  updateService,
  uploadServiceImage,
} = require('../controllers/service.controller')
const { requireAuth, requireRole } = require('../middleware/auth.middleware')
const { requestImageUpload } = require('../middleware/upload.middleware')

const router = express.Router()

router.get('/categories', listCategories)
router.get('/pricing-addons', listPricingAddons)
router.get('/mine', requireAuth, requireRole('gardener'), listMyServices)
router.get('/', listServices)
router.get('/:serviceId/image', sendServiceImage)
router.get('/:serviceId', getService)
router.post('/', requireAuth, requireRole('gardener'), createService)
router.put('/:serviceId', requireAuth, requireRole('gardener'), updateService)
router.post('/:serviceId/image', requireAuth, requireRole('gardener'), requestImageUpload.single('image'), uploadServiceImage)
router.delete('/:serviceId/image', requireAuth, requireRole('gardener'), deleteServiceImage)
router.delete('/:serviceId', requireAuth, requireRole('gardener'), deactivateService)

module.exports = router
