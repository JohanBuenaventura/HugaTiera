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
          (SELECT COUNT(*) FROM inquiries WHERE gardener_id = ?) AS inquiries,
          (SELECT COUNT(*) FROM bookings WHERE gardener_id = ?) AS bookings
      `, [user.id, user.id, user.id])
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

module.exports = {
  getProfile,
  updateProfile,
}
