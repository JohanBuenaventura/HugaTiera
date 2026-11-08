const express = require('express')
const { createGardenPlan } = require('../controllers/ai.controller')
const { requireAuth } = require('../middleware/auth.middleware')

const router = express.Router()

router.use(requireAuth)
router.post('/garden-plan', createGardenPlan)

module.exports = router
