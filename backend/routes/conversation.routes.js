const express = require('express')
const {
  createConversation,
  listConversations,
  listMessages,
  sendMessage,
} = require('../controllers/conversation.controller')
const { requireAuth } = require('../middleware/auth.middleware')

const router = express.Router()

router.use(requireAuth)
router.get('/', listConversations)
router.post('/', createConversation)
router.get('/:conversationId/messages', listMessages)
router.post('/:conversationId/messages', sendMessage)

module.exports = router
