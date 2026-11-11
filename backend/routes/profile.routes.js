const express = require('express')
const { createReport, getProfile, updateProfile } = require('../controllers/profile.controller')
const { requireAuth } = require('../middleware/auth.middleware')

const router = express.Router()

router.use(requireAuth)
router.get('/me', getProfile)
router.put('/me', updateProfile)
router.post('/reports', createReport)

module.exports = router
