const express = require('express')
const {
  deleteRequestImage,
  getRequestImageFile,
  listInquiryImages,
  uploadRequestImage,
} = require('../controllers/requestImage.controller')
const { requireAuth, requireRole } = require('../middleware/auth.middleware')
const { requestImageUpload } = require('../middleware/upload.middleware')

const router = express.Router()

router.use(requireAuth)

router.get('/inquiry/:inquiryId', listInquiryImages)
router.get('/:imageId', getRequestImageFile)
router.post('/', requireRole('client'), requestImageUpload.single('image'), uploadRequestImage)
router.delete('/:imageId', requireRole('client'), deleteRequestImage)

module.exports = router
