const express = require('express')
const {
  createService,
  deactivateService,
  getService,
  listCategories,
  listMyServices,
  listServices,
  updateService,
} = require('../controllers/service.controller')
const { requireAuth, requireRole } = require('../middleware/auth.middleware')

const router = express.Router()

router.get('/categories', listCategories)
router.get('/mine', requireAuth, requireRole('gardener'), listMyServices)
router.get('/', listServices)
router.get('/:serviceId', getService)
router.post('/', requireAuth, requireRole('gardener'), createService)
router.put('/:serviceId', requireAuth, requireRole('gardener'), updateService)
router.delete('/:serviceId', requireAuth, requireRole('gardener'), deactivateService)

module.exports = router
