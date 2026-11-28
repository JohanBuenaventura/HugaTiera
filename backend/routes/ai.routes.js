const express = require('express')
const {
  analyzeUploadedPhoto,
  createGardenImagePreview,
  createGardenPlan,
  createRecommendationSummary,
  createRequirementAssistance,
  getAiUsageStatus,
  getSmartRecommendations,
  streamGardenPlan,
} = require('../controllers/ai.controller')
const { requireAuth } = require('../middleware/auth.middleware')
const { requestImageUpload } = require('../middleware/upload.middleware')

const router = express.Router()

router.use(requireAuth)
router.get('/usage', getAiUsageStatus)
router.get('/recommendations', getSmartRecommendations)
router.post('/recommendations/summary', createRecommendationSummary)
router.post('/garden-plan', createGardenPlan)
router.post('/garden-plan/stream', streamGardenPlan)
router.post('/requirements', createRequirementAssistance)
router.post('/photo-analysis', analyzeUploadedPhoto)
router.post(
  '/garden-image',
  (req, res, next) => {
    if (req.is('multipart/form-data')) {
      return requestImageUpload.single('image')(req, res, next)
    }
    return next()
  },
  createGardenImagePreview,
)

module.exports = router
