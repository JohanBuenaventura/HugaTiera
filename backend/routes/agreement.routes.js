const express = require('express')
const {
  approveAgreement,
  cancelAgreement,
  editAgreement,
  getAgreement,
  listInquiryAgreements,
  proposeAgreement,
  proposeDirectServiceAgreement,
} = require('../controllers/agreement.controller')
const { requireAuth } = require('../middleware/auth.middleware')

const router = express.Router()

router.use(requireAuth)

router.get('/inquiry/:inquiryId', listInquiryAgreements)
router.post('/inquiry/:inquiryId', proposeAgreement)
router.post('/direct-service', proposeDirectServiceAgreement)
router.post('/', proposeAgreement)
router.get('/:agreementId', getAgreement)
router.put('/:agreementId', editAgreement)
router.post('/:agreementId/approve', approveAgreement)
router.post('/:agreementId/cancel', cancelAgreement)

module.exports = router
