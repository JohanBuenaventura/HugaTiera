const { pool } = require('../config/database')

async function listNotifications(req, res, next) {
  try {
    const [notifications] = await pool.execute(
      `SELECT id, notification_type, title, message, related_entity_type,
              related_entity_id, read_at, created_at
       FROM notifications WHERE user_id = ?
       ORDER BY created_at DESC LIMIT 50`,
      [req.user.id],
    )
    const [counts] = await pool.execute(
      'SELECT COUNT(*) AS unread_count FROM notifications WHERE user_id = ? AND read_at IS NULL',
      [req.user.id],
    )
    return res.json({ notifications, unreadCount: counts[0].unread_count })
  } catch (error) {
    return next(error)
  }
}

async function markNotificationRead(req, res, next) {
  try {
    const [result] = await pool.execute(
      'UPDATE notifications SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP) WHERE id = ? AND user_id = ?',
      [Number(req.params.notificationId), req.user.id],
    )
    if (!result.affectedRows) return res.status(404).json({ message: 'Notification was not found.' })
    return res.status(204).send()
  } catch (error) {
    return next(error)
  }
}

async function markAllNotificationsRead(req, res, next) {
  try {
    await pool.execute(
      'UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE user_id = ? AND read_at IS NULL',
      [req.user.id],
    )
    return res.status(204).send()
  } catch (error) {
    return next(error)
  }
}

module.exports = {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
}
