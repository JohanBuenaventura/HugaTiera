const express = require('express')
const {
  analyzeUploadedPhoto,
  createGardenPlan,
  createRecommendationSummary,
  createRequirementAssistance,
  getAiUsageStatus,
  getSmartRecommendations,
  streamGardenPlan,
} = require('../controllers/ai.controller')
const { requireAuth } = require('../middleware/auth.middleware')

const router = express.Router()

router.use(requireAuth)
router.get('/usage', getAiUsageStatus)
router.get('/recommendations', getSmartRecommendations)
router.post('/recommendations/summary', createRecommendationSummary)
router.post('/garden-plan', createGardenPlan)
router.post('/garden-plan/stream', streamGardenPlan)
router.post('/requirements', createRequirementAssistance)
router.post('/photo-analysis', analyzeUploadedPhoto)

module.exports = router
