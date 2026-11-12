const { pool } = require('../config/database')

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function validateCommonProfile(body) {
  const firstName = text(body.firstName)
  const lastName = text(body.lastName)
  const phone = text(body.phone) || null

  if (!firstName || firstName.length > 100 || !lastName || lastName.length > 100) {
    return { message: 'First name and last name are required.' }
  }
  if (phone && phone.length > 30) return { message: 'Phone number is too long.' }

  return { firstName, lastName, phone }
}

async function getProfile(req, res, next) {
  try {
    const [users] = await pool.execute(
      'SELECT id, email, role, first_name, last_name, phone, created_at FROM users WHERE id = ? AND is_active = TRUE LIMIT 1',
      [req.user.id],
    )
    const user = users[0]

    if (!user) return res.status(404).json({ message: 'Profile was not found.' })

    let profile = null
    let counts = {}
    if (user.role === 'client') {
      const [profiles] = await pool.execute('SELECT address, city, bio FROM client_profiles WHERE user_id = ?', [user.id])
      profile = profiles[0] || null
      const [result] = await pool.execute(`
        SELECT
          (SELECT COUNT(*) FROM inquiries WHERE client_id = ?) AS inquiries,
          (SELECT COUNT(*) FROM bookings WHERE client_id = ?) AS bookings,
          (SELECT COUNT(*) FROM notifications WHERE user_id = ?) AS notifications
      `, [user.id, user.id, user.id])
      counts = result[0]
    } else if (user.role === 'gardener') {
      const [profiles] = await pool.execute(
        'SELECT business_name, description, service_area, years_of_experience, is_approved FROM gardener_profiles WHERE user_id = ?',
        [user.id],
      )
      profile = profiles[0] || null
      const [result] = await pool.execute(`
        SELECT
          (SELECT COUNT(*) FROM services WHERE gardener_id = ? AND is_active = TRUE) AS services,
          (SELECT COUNT(*) FROM inquiries i
           WHERE i.gardener_id = ?
              OR EXISTS (SELECT 1 FROM quotations q WHERE q.inquiry_id = i.id AND q.gardener_id = ?)) AS inquiries,
          (SELECT COUNT(*) FROM bookings WHERE gardener_id = ?) AS bookings
      `, [user.id, user.id, user.id, user.id])
      counts = result[0]
    }

    return res.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.first_name,
        lastName: user.last_name,
        phone: user.phone,
        createdAt: user.created_at,
      },
      profile,
      counts,
    })
  } catch (error) {
    return next(error)
  }
}

async function updateProfile(req, res, next) {
  const common = validateCommonProfile(req.body)
  if (common.message) return res.status(400).json(common)

  const connection = await pool.getConnection()

  try {
    await connection.beginTransaction()
    await connection.execute(
      'UPDATE users SET first_name = ?, last_name = ?, phone = ? WHERE id = ? AND is_active = TRUE',
      [common.firstName, common.lastName, common.phone, req.user.id],
    )

    if (req.user.role === 'client') {
      const address = text(req.body.address) || null
      const city = text(req.body.city) || 'Zamboanga City'
      const bio = text(req.body.bio) || null
      if (address && address.length > 255) {
        await connection.rollback()
        return res.status(400).json({ message: 'Address is too long.' })
      }
      if (city.length > 100) {
        await connection.rollback()
        return res.status(400).json({ message: 'City is too long.' })
      }
      await connection.execute(
        'UPDATE client_profiles SET address = ?, city = ?, bio = ? WHERE user_id = ?',
        [address, city, bio, req.user.id],
      )
    } else if (req.user.role === 'gardener') {
      const businessName = text(req.body.businessName) || null
      const description = text(req.body.description) || null
      const serviceArea = text(req.body.serviceArea) || 'Zamboanga City'
      const years = req.body.yearsOfExperience === '' || req.body.yearsOfExperience === null
        ? null
        : Number(req.body.yearsOfExperience)
      if (businessName && businessName.length > 150) {
        await connection.rollback()
        return res.status(400).json({ message: 'Business name is too long.' })
      }
      if (serviceArea.length > 150) {
        await connection.rollback()
        return res.status(400).json({ message: 'Service area is too long.' })
      }
      if (years !== null && (!Number.isInteger(years) || years < 0 || years > 100)) {
        await connection.rollback()
        return res.status(400).json({ message: 'Years of experience must be between 0 and 100.' })
      }
      await connection.execute(
        'UPDATE gardener_profiles SET business_name = ?, description = ?, service_area = ?, years_of_experience = ? WHERE user_id = ?',
        [businessName, description, serviceArea, years, req.user.id],
      )
    }

    await connection.commit()
    return getProfile(req, res, next)
  } catch (error) {
    await connection.rollback()
    return next(error)
  } finally {
    connection.release()
  }
}

async function createReport(req, res, next) {
  const reason = text(req.body.reason)
  const details = text(req.body.details) || null
  const reportedUserId = req.body.reportedUserId ? Number(req.body.reportedUserId) : null
  const reportedServiceId = req.body.reportedServiceId ? Number(req.body.reportedServiceId) : null
  const reportedMessageId = req.body.reportedMessageId ? Number(req.body.reportedMessageId) : null

  if (!reason || reason.length > 255) {
    return res.status(400).json({ message: 'A report reason between 1 and 255 characters is required.' })
  }
  if (details && details.length > 2000) {
    return res.status(400).json({ message: 'Report details must be 2,000 characters or fewer.' })
  }

  const hasValidTarget = [reportedUserId, reportedServiceId, reportedMessageId].some(
    (targetId) => Number.isInteger(targetId) && targetId > 0,
  )
  if (!hasValidTarget) {
    return res.status(400).json({ message: 'A valid user, service, or message target is required to submit a report.' })
  }
  if (reportedUserId === req.user.id) {
    return res.status(400).json({ message: 'You cannot submit a report against your own account.' })
  }

  try {
    if (reportedUserId) {
      const [users] = await pool.execute('SELECT id FROM users WHERE id = ? LIMIT 1', [reportedUserId])
      if (!users[0]) return res.status(404).json({ message: 'Reported user was not found.' })
    }
    if (reportedServiceId) {
      const [services] = await pool.execute('SELECT id, gardener_id FROM services WHERE id = ? LIMIT 1', [reportedServiceId])
      if (!services[0]) return res.status(404).json({ message: 'Reported service was not found.' })
      if (services[0].gardener_id === req.user.id) {
        return res.status(400).json({ message: 'You cannot report your own service listing.' })
      }
    }
    if (reportedMessageId) {
      const [messages] = await pool.execute('SELECT id, sender_id FROM messages WHERE id = ? LIMIT 1', [reportedMessageId])
      if (!messages[0]) return res.status(404).json({ message: 'Reported message was not found.' })
      if (messages[0].sender_id === req.user.id) {
        return res.status(400).json({ message: 'You cannot report your own message.' })
      }
    }

    const [result] = await pool.execute(
      `INSERT INTO reports
        (reporter_id, reported_user_id, reported_service_id, reported_message_id, reason, details)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        req.user.id,
        reportedUserId || null,
        reportedServiceId || null,
        reportedMessageId || null,
        reason,
        details,
      ],
    )
    return res.status(201).json({ id: result.insertId, status: 'open' })
  } catch (error) {
    return next(error)
  }
}

module.exports = {
  createReport,
  getProfile,
  updateProfile,
}
