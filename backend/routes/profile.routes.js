const express = require('express')
const {
  addUnavailableDate,
  createReport,
  deleteAvatar,
  deleteUnavailableDate,
  getProfile,
  listUnavailableDates,
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
router.get('/me/unavailable-dates', listUnavailableDates)
router.post('/me/unavailable-dates', addUnavailableDate)
router.delete('/me/unavailable-dates/:blockId', deleteUnavailableDate)
router.post('/me/avatar', requestImageUpload.single('avatar'), uploadAvatar)
router.delete('/me/avatar', deleteAvatar)
router.post('/reports', createReport)

module.exports = router
