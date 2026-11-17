const express = require('express')
const {
  createReport,
  deleteAvatar,
  getProfile,
  sendAvatar,
  updateProfile,
  uploadAvatar,
} = require('../controllers/profile.controller')
const { requireAuth } = require('../middleware/auth.middleware')
const { requestImageUpload } = require('../middleware/upload.middleware')

const router = express.Router()

router.get('/:userId/avatar', sendAvatar)
router.use(requireAuth)
router.get('/me', getProfile)
router.put('/me', updateProfile)
router.post('/me/avatar', requestImageUpload.single('avatar'), uploadAvatar)
router.delete('/me/avatar', deleteAvatar)
router.post('/reports', createReport)

module.exports = router
