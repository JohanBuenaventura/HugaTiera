const express = require('express')
const {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} = require('../controllers/notification.controller')
const { requireAuth } = require('../middleware/auth.middleware')

const router = express.Router()

router.use(requireAuth)
router.get('/', listNotifications)
router.patch('/read-all', markAllNotificationsRead)
router.patch('/:notificationId/read', markNotificationRead)

module.exports = router
