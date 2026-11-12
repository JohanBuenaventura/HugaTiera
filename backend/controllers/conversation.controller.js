const { pool } = require('../config/database')
const { createNotification } = require('../services/notification.service')

function messageText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

async function getConversationAccess(conversationId, userId) {
  const [rows] = await pool.execute(
    `SELECT id, client_id, gardener_id, inquiry_id
     FROM conversations
     WHERE id = ? AND (client_id = ? OR gardener_id = ?)
     LIMIT 1`,
    [conversationId, userId, userId],
  )
  return rows[0]
}

async function listConversations(req, res, next) {
  try {
    const [conversations] = await pool.execute(
      `SELECT c.id, c.client_id, c.gardener_id, c.inquiry_id, c.created_at,
              CASE WHEN c.client_id = ?
                   THEN COALESCE(NULLIF(TRIM(gp.business_name), ''), CONCAT(gardener.first_name, ' ', gardener.last_name))
                   ELSE CONCAT(client.first_name, ' ', client.last_name) END AS other_party_name,
              i.subject AS inquiry_subject,
              i.request_type AS inquiry_request_type,
              latest.message_text AS latest_message,
              latest.sent_at AS latest_message_at,
              COALESCE(unread.unread_count, 0) AS unread_count
       FROM conversations c
       JOIN users client ON client.id = c.client_id
       JOIN users gardener ON gardener.id = c.gardener_id
       LEFT JOIN gardener_profiles gp ON gp.user_id = c.gardener_id
       LEFT JOIN inquiries i ON i.id = c.inquiry_id
       LEFT JOIN (
         SELECT m1.conversation_id, m1.message_text, m1.sent_at
         FROM messages m1
         JOIN (
           SELECT conversation_id, MAX(id) AS latest_id
           FROM messages GROUP BY conversation_id
         ) latest_ids ON latest_ids.latest_id = m1.id
       ) latest ON latest.conversation_id = c.id
       LEFT JOIN (
         SELECT conversation_id, COUNT(*) AS unread_count
         FROM messages
         WHERE sender_id <> ? AND read_at IS NULL
         GROUP BY conversation_id
       ) unread ON unread.conversation_id = c.id
       WHERE c.client_id = ? OR c.gardener_id = ?
       ORDER BY COALESCE(latest.sent_at, c.created_at) DESC`,
      [req.user.id, req.user.id, req.user.id, req.user.id],
    )
    return res.json({ conversations })
  } catch (error) {
    return next(error)
  }
}

async function createConversation(req, res, next) {
  const inquiryId = Number(req.body.inquiryId)
  const bookingId = Number(req.body.bookingId)
  const hasInquiry = Number.isInteger(inquiryId) && inquiryId > 0
  const hasBooking = Number.isInteger(bookingId) && bookingId > 0

  if (!hasInquiry && !hasBooking) {
    return res.status(400).json({ message: 'A valid inquiry or booking is required.' })
  }

  try {
    let clientId
    let gardenerId
    let linkedInquiryId = null

    if (hasInquiry) {
      const [inquiries] = await pool.execute(
        `SELECT id, request_type, client_id, gardener_id
         FROM inquiries
         WHERE id = ?
         LIMIT 1`,
        [inquiryId],
      )
      const inquiry = inquiries[0]
      if (!inquiry) return res.status(404).json({ message: 'Inquiry was not found.' })

      if (inquiry.request_type === 'general') {
        if (req.user.role === 'gardener') {
          const [offers] = await pool.execute(
            `SELECT id FROM quotations
             WHERE inquiry_id = ? AND gardener_id = ? AND status IN ('sent', 'accepted')
             LIMIT 1`,
            [inquiry.id, req.user.id],
          )
          if (!offers[0]) {
            return res.status(403).json({
              message: 'You can only message the client on a general service request after submitting an offer.',
            })
          }
          clientId = inquiry.client_id
          gardenerId = req.user.id
          linkedInquiryId = inquiry.id
        } else if (req.user.id === inquiry.client_id) {
          const rawGardenerId = req.body?.gardenerId ?? req.body?.gardener_id ?? inquiry.gardener_id
          const targetGardenerId = Number(rawGardenerId)
          if (!Number.isInteger(targetGardenerId) || targetGardenerId <= 0) {
            return res.status(400).json({
              message: 'Please select a gardener who has submitted an offer to start a conversation.',
            })
          }
          const [offers] = await pool.execute(
            `SELECT id FROM quotations
             WHERE inquiry_id = ? AND gardener_id = ? AND status IN ('sent', 'accepted')
             LIMIT 1`,
            [inquiry.id, targetGardenerId],
          )
          if (!offers[0] && inquiry.gardener_id !== targetGardenerId) {
            return res.status(403).json({
              message: 'A conversation on a general service request requires an active offer from that gardener.',
            })
          }
          clientId = inquiry.client_id
          gardenerId = targetGardenerId
          linkedInquiryId = inquiry.id
        } else {
          return res.status(404).json({ message: 'Inquiry was not found.' })
        }
      } else {
        if (req.user.id !== inquiry.client_id && req.user.id !== inquiry.gardener_id) {
          return res.status(404).json({ message: 'Inquiry was not found.' })
        }
        clientId = inquiry.client_id
        gardenerId = inquiry.gardener_id
        linkedInquiryId = inquiry.id
      }
    } else {
      const [bookings] = await pool.execute(
        `SELECT id, client_id, gardener_id, inquiry_id
         FROM bookings
         WHERE id = ? AND (client_id = ? OR gardener_id = ?)
         LIMIT 1`,
        [bookingId, req.user.id, req.user.id],
      )
      if (!bookings[0]) return res.status(404).json({ message: 'Booking was not found.' })
      clientId = bookings[0].client_id
      gardenerId = bookings[0].gardener_id
      linkedInquiryId = bookings[0].inquiry_id || null
    }

    if (linkedInquiryId) {
      const [result] = await pool.execute(
        `INSERT INTO conversations (client_id, gardener_id, inquiry_id)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
        [clientId, gardenerId, linkedInquiryId],
      )
      return res.status(201).json({ id: result.insertId })
    }

    const [existing] = await pool.execute(
      `SELECT id FROM conversations
       WHERE client_id = ? AND gardener_id = ? AND inquiry_id IS NULL
       ORDER BY id DESC LIMIT 1`,
      [clientId, gardenerId],
    )
    if (existing[0]) {
      return res.status(201).json({ id: existing[0].id })
    }

    const [result] = await pool.execute(
      'INSERT INTO conversations (client_id, gardener_id, inquiry_id) VALUES (?, ?, NULL)',
      [clientId, gardenerId],
    )
    return res.status(201).json({ id: result.insertId })
  } catch (error) {
    return next(error)
  }
}

async function listMessages(req, res, next) {
  const conversationId = Number(req.params.conversationId)
  try {
    const conversation = await getConversationAccess(conversationId, req.user.id)
    if (!conversation) return res.status(404).json({ message: 'Conversation was not found.' })

    await pool.execute(
      'UPDATE messages SET read_at = CURRENT_TIMESTAMP WHERE conversation_id = ? AND sender_id <> ? AND read_at IS NULL',
      [conversationId, req.user.id],
    )
    const [messages] = await pool.execute(
      `SELECT m.id, m.sender_id, m.message_text, m.sent_at, m.read_at,
              u.first_name, u.last_name
       FROM messages m JOIN users u ON u.id = m.sender_id
       WHERE m.conversation_id = ? ORDER BY m.sent_at ASC, m.id ASC`,
      [conversationId],
    )
    return res.json({ conversation, messages })
  } catch (error) {
    return next(error)
  }
}

async function sendMessage(req, res, next) {
  const conversationId = Number(req.params.conversationId)
  const body = messageText(req.body.message)
  if (!body || body.length > 5000) {
    return res.status(400).json({ message: 'Message must contain between 1 and 5,000 characters.' })
  }

  try {
    const conversation = await getConversationAccess(conversationId, req.user.id)
    if (!conversation) return res.status(404).json({ message: 'Conversation was not found.' })

    if (conversation.inquiry_id && req.user.id === conversation.gardener_id) {
      const [inquiries] = await pool.execute(
        'SELECT request_type FROM inquiries WHERE id = ? LIMIT 1',
        [conversation.inquiry_id],
      )
      if (inquiries[0]?.request_type === 'general') {
        const [offers] = await pool.execute(
          `SELECT id FROM quotations
           WHERE inquiry_id = ? AND gardener_id = ? AND status IN ('sent', 'accepted')
           LIMIT 1`,
          [conversation.inquiry_id, req.user.id],
        )
        if (!offers[0]) {
          return res.status(403).json({
            message: 'You can only send messages on a general service request while you have an active offer.',
          })
        }
      }
    }

    const recipientId = conversation.client_id === req.user.id ? conversation.gardener_id : conversation.client_id
    const [result] = await pool.execute(
      'INSERT INTO messages (conversation_id, sender_id, message_text) VALUES (?, ?, ?)',
      [conversationId, req.user.id, body],
    )
    await createNotification({
      userId: recipientId,
      type: 'new_message',
      title: 'New message',
      message: 'You received a new message.',
      entityType: 'conversation',
      entityId: conversationId,
    })
    return res.status(201).json({ id: result.insertId })
  } catch (error) {
    return next(error)
  }
}

module.exports = {
  createConversation,
  listConversations,
  listMessages,
  sendMessage,
}
