const express = require('express')
const {
  createInquiry,
  createQuotation,
  getInquiry,
  listInquiries,
  reviseQuotation,
  updateInquiryStatus,
  updateQuotationStatus,
  withdrawQuotation,
} = require('../controllers/inquiry.controller')
const {
  listInquiryAgreements,
  proposeAgreement,
} = require('../controllers/agreement.controller')
const { requireAuth, requireRole } = require('../middleware/auth.middleware')

const router = express.Router()

router.use(requireAuth)
router.get('/', listInquiries)
router.get('/:inquiryId', getInquiry)
router.get('/:inquiryId/agreements', listInquiryAgreements)
router.post('/:inquiryId/agreements', proposeAgreement)
router.post('/', requireRole('client'), createInquiry)
router.patch('/:inquiryId/status', updateInquiryStatus)
router.post('/:inquiryId/quotations', requireRole('gardener'), createQuotation)
router.put('/quotations/:quotationId', requireRole('gardener'), reviseQuotation)
router.post('/quotations/:quotationId/withdraw', requireRole('gardener'), withdrawQuotation)
router.patch('/quotations/:quotationId/status', requireRole('client'), updateQuotationStatus)

module.exports = router
