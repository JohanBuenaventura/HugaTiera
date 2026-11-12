const express = require('express')
const {
  analyzeUploadedPhoto,
  createGardenPlan,
  createRequirementAssistance,
  getAiUsageStatus,
} = require('../controllers/ai.controller')
const { requireAuth } = require('../middleware/auth.middleware')

const router = express.Router()

router.use(requireAuth)
router.get('/usage', getAiUsageStatus)
router.post('/garden-plan', createGardenPlan)
router.post('/requirements', createRequirementAssistance)
router.post('/photo-analysis', analyzeUploadedPhoto)

module.exports = router
