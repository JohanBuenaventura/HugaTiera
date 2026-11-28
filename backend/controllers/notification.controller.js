const { pool } = require('../config/database')

function buildNotificationRoleScope(role, userId) {
  if (role === 'client') {
    return {
      sql: `AND (
        (n.related_entity_type = 'inquiry' AND EXISTS (
          SELECT 1 FROM inquiries i WHERE i.id = n.related_entity_id AND i.client_id = ?
        ))
        OR (n.related_entity_type = 'booking' AND EXISTS (
          SELECT 1 FROM bookings b WHERE b.id = n.related_entity_id AND b.client_id = ?
        ))
        OR (n.related_entity_type = 'conversation' AND EXISTS (
          SELECT 1 FROM conversations c WHERE c.id = n.related_entity_id AND c.client_id = ?
        ))
        OR (n.related_entity_type IS NULL OR n.related_entity_type NOT IN ('inquiry', 'booking', 'conversation', 'gardener_profile', 'review'))
      )`,
      params: [userId, userId, userId],
    }
  }
  if (role === 'gardener') {
    return {
      sql: `AND (
        (n.related_entity_type = 'inquiry' AND EXISTS (
          SELECT 1 FROM inquiries i WHERE i.id = n.related_entity_id AND i.client_id <> ?
        ))
        OR (n.related_entity_type = 'booking' AND EXISTS (
          SELECT 1 FROM bookings b WHERE b.id = n.related_entity_id AND b.gardener_id = ?
        ))
        OR (n.related_entity_type = 'conversation' AND EXISTS (
          SELECT 1 FROM conversations c WHERE c.id = n.related_entity_id AND c.gardener_id = ?
        ))
        OR n.related_entity_type IN ('gardener_profile', 'review')
        OR (n.related_entity_type IS NULL OR n.related_entity_type NOT IN ('inquiry', 'booking', 'conversation', 'gardener_profile', 'review'))
      )`,
      params: [userId, userId, userId],
    }
  }
  return { sql: '', params: [] }
}

async function listNotifications(req, res, next) {
  try {
    const scope = buildNotificationRoleScope(req.user.role, req.user.id)
    const [notifications] = await pool.execute(
      `SELECT n.id, n.notification_type, n.title, n.message, n.related_entity_type,
              n.related_entity_id, n.read_at, n.created_at
       FROM notifications n
       WHERE n.user_id = ? ${scope.sql}
       ORDER BY n.created_at DESC LIMIT 50`,
      [req.user.id, ...scope.params],
    )
    const [counts] = await pool.execute(
      `SELECT COUNT(*) AS unread_count
       FROM notifications n
       WHERE n.user_id = ? AND n.read_at IS NULL ${scope.sql}`,
      [req.user.id, ...scope.params],
    )
    return res.json({ notifications, unreadCount: counts[0].unread_count })
  } catch (error) {
    return next(error)
  }
}

async function markNotificationRead(req, res, next) {
  try {
    const scope = buildNotificationRoleScope(req.user.role, req.user.id)
    const [result] = await pool.execute(
      `UPDATE notifications n
       SET n.read_at = COALESCE(n.read_at, CURRENT_TIMESTAMP)
       WHERE n.id = ? AND n.user_id = ? ${scope.sql}`,
      [Number(req.params.notificationId), req.user.id, ...scope.params],
    )
    if (!result.affectedRows) return res.status(404).json({ message: 'Notification was not found.' })
    return res.status(204).send()
  } catch (error) {
    return next(error)
  }
}

async function markAllNotificationsRead(req, res, next) {
  try {
    const scope = buildNotificationRoleScope(req.user.role, req.user.id)
    await pool.execute(
      `UPDATE notifications n
       SET n.read_at = CURRENT_TIMESTAMP
       WHERE n.user_id = ? AND n.read_at IS NULL ${scope.sql}`,
      [req.user.id, ...scope.params],
    )
    return res.status(204).send()
  } catch (error) {
    return next(error)
  }
}

module.exports = {
  buildNotificationRoleScope,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
}
