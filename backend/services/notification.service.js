const { pool } = require('../config/database')

async function createNotification({
  userId,
  type,
  title,
  message,
  entityType = null,
  entityId = null,
  connection = pool,
}) {
  await connection.execute(
    `INSERT INTO notifications
      (user_id, notification_type, title, message, related_entity_type, related_entity_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, type, title, message, entityType, entityId],
  )
}

module.exports = { createNotification }
