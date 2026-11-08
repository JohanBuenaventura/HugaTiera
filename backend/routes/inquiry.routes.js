const express = require('express')
const {
  createInquiry,
  createQuotation,
  getInquiry,
  listInquiries,
  updateInquiryStatus,
  updateQuotationStatus,
} = require('../controllers/inquiry.controller')
const { requireAuth, requireRole } = require('../middleware/auth.middleware')

const router = express.Router()

router.use(requireAuth)
router.get('/', listInquiries)
router.get('/:inquiryId', getInquiry)
router.post('/', requireRole('client'), createInquiry)
router.patch('/:inquiryId/status', updateInquiryStatus)
router.post('/:inquiryId/quotations', requireRole('gardener'), createQuotation)
router.patch('/quotations/:quotationId/status', requireRole('client'), updateQuotationStatus)

module.exports = router
