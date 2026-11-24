const express = require('express')
const {
  createPortfolio,
  deletePortfolio,
  listMyPortfolio,
  sendPortfolioImage,
  updatePortfolio,
} = require('../controllers/portfolio.controller')
const { requireAuth, requireRole } = require('../middleware/auth.middleware')
const { requestImageUpload } = require('../middleware/upload.middleware')

const router = express.Router()

router.get('/:portfolioId/image', sendPortfolioImage)
router.use(requireAuth, requireRole('gardener'))
router.get('/me', listMyPortfolio)
router.post('/', requestImageUpload.single('image'), createPortfolio)
router.put('/:portfolioId', updatePortfolio)
router.delete('/:portfolioId', deletePortfolio)

module.exports = router
