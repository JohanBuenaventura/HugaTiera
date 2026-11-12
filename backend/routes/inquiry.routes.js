const express = require('express')
const {
  createInquiry,
  createQuotation,
  getInquiry,
  listInquiries,
  listOpenRequests,
  renewInquiry,
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
router.get('/', requireRole('client', 'gardener'), listInquiries)
router.get('/open', requireRole('gardener', 'administrator'), listOpenRequests)
router.get('/:inquiryId', getInquiry)
router.get('/:inquiryId/agreements', listInquiryAgreements)
router.post('/:inquiryId/agreements', proposeAgreement)
router.post('/', requireRole('client'), createInquiry)
router.post('/:inquiryId/renew', requireRole('client'), renewInquiry)
router.patch('/:inquiryId/status', updateInquiryStatus)
router.post('/:inquiryId/quotations', requireRole('gardener'), createQuotation)
router.put('/quotations/:quotationId', requireRole('gardener'), reviseQuotation)
router.post('/quotations/:quotationId/withdraw', requireRole('gardener'), withdrawQuotation)
router.patch('/quotations/:quotationId/status', requireRole('client'), updateQuotationStatus)

module.exports = router
