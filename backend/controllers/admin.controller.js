const { pool } = require('../config/database')
const { createNotification } = require('../services/notification.service')

async function getSummary(req, res, next) {
  try {
    const [counts] = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM users WHERE role = 'client' AND is_active = TRUE) AS clients,
        (SELECT COUNT(*) FROM users WHERE role = 'gardener' AND is_active = TRUE) AS gardeners,
        (SELECT COUNT(*) FROM services WHERE is_active = TRUE) AS services,
        (SELECT COUNT(*) FROM bookings) AS bookings,
        (SELECT COUNT(*) FROM reports WHERE status IN ('open', 'reviewing')) AS open_reports,
        (SELECT COUNT(*) FROM gardener_profiles WHERE is_approved = FALSE) AS pending_gardeners
    `)
    const [users] = await pool.query(
      'SELECT id, email, role, first_name, last_name, is_active, created_at FROM users ORDER BY created_at DESC LIMIT 50',
    )

    return res.json({ counts: counts[0], users })
  } catch (error) {
    return next(error)
  }
}

async function updateUserStatus(req, res, next) {
  const userId = Number(req.params.userId)
  if (!Number.isInteger(userId) || userId < 1 || userId === req.user.id) {
    return res.status(400).json({ message: 'A valid different user is required.' })
  }

  try {
    const isActive = req.body.isActive === true || req.body.isActive === 'true'
    const [result] = await pool.execute('UPDATE users SET is_active = ? WHERE id = ?', [isActive, userId])
    if (result.affectedRows === 0) return res.status(404).json({ message: 'User was not found.' })
    return res.json({ status: 'ok' })
  } catch (error) {
    return next(error)
  }
}

async function listPendingGardeners(req, res, next) {
  try {
    const [gardeners] = await pool.execute(`
      SELECT u.id, u.email, u.first_name, u.last_name, u.is_active, u.created_at,
             gp.business_name, gp.description, gp.service_area, gp.years_of_experience,
             gp.is_approved
      FROM users u
      JOIN gardener_profiles gp ON gp.user_id = u.id
      WHERE u.role = 'gardener' AND gp.is_approved = FALSE
      ORDER BY u.created_at ASC
    `)
    return res.json({ gardeners })
  } catch (error) {
    return next(error)
  }
}

async function updateGardenerApproval(req, res, next) {
  const gardenerId = Number(req.params.userId)
  if (!Number.isInteger(gardenerId) || gardenerId < 1) {
    return res.status(400).json({ message: 'A valid gardener is required.' })
  }

  const approvalValue = req.body.isApproved
  if (approvalValue !== true && approvalValue !== false && approvalValue !== 'true' && approvalValue !== 'false') {
    return res.status(400).json({ message: 'A valid approval decision is required.' })
  }
  const isApproved = approvalValue === true || approvalValue === 'true'
  const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() : ''
  if (!isApproved && reason.length > 500) {
    return res.status(400).json({ message: 'The approval feedback must be 500 characters or fewer.' })
  }
  const connection = await pool.getConnection()

  try {
    await connection.beginTransaction()
    const [result] = await connection.execute(
      `UPDATE gardener_profiles gp
       JOIN users u ON u.id = gp.user_id
       SET gp.is_approved = ?
       WHERE gp.user_id = ? AND u.role = 'gardener'`,
      [isApproved, gardenerId],
    )
    if (!result.affectedRows) {
      await connection.rollback()
      return res.status(404).json({ message: 'Gardener was not found.' })
    }

    await createNotification({
      userId: gardenerId,
      type: isApproved ? 'gardener_approved' : 'gardener_rejected',
      title: isApproved ? 'Gardener profile approved' : 'Gardener profile approval withdrawn',
      message: isApproved
        ? 'Your gardener profile has been approved. Your active services are now visible in the public marketplace.'
        : `Your gardener profile still needs approval. Update your profile and services, then contact the administrator for another review.${reason ? ` Feedback: ${reason}` : ''}`,
      entityType: 'gardener_profile',
      entityId: gardenerId,
      connection,
    })
    await connection.commit()
    return res.json({ status: 'ok', isApproved })
  } catch (error) {
    await connection.rollback()
    return next(error)
  } finally {
    connection.release()
  }
}

async function listCategories(req, res, next) {
  try {
    const [categories] = await pool.execute('SELECT id, name, description, is_active, created_at FROM service_categories ORDER BY name')
    return res.json({ categories })
  } catch (error) { return next(error) }
}

async function createCategory(req, res, next) {
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : ''
  const description = typeof req.body.description === 'string' ? req.body.description.trim() : null
  if (!name || name.length > 100) return res.status(400).json({ message: 'Category name is required and must be 100 characters or fewer.' })
  try {
    const [result] = await pool.execute('INSERT INTO service_categories (name, description) VALUES (?, ?)', [name, description || null])
    return res.status(201).json({ id: result.insertId })
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'A category with this name already exists.' })
    return next(error)
  }
}

async function updateCategory(req, res, next) {
  const categoryId = Number(req.params.categoryId)
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : ''
  const description = typeof req.body.description === 'string' ? req.body.description.trim() : null
  const isActive = req.body.isActive === true || req.body.isActive === 'true'
  if (!Number.isInteger(categoryId) || categoryId < 1 || !name || name.length > 100) return res.status(400).json({ message: 'Valid category details are required.' })
  try {
    const [result] = await pool.execute('UPDATE service_categories SET name = ?, description = ?, is_active = ? WHERE id = ?', [name, description || null, isActive, categoryId])
    if (!result.affectedRows) return res.status(404).json({ message: 'Category was not found.' })
    return res.json({ status: 'ok' })
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'A category with this name already exists.' })
    return next(error)
  }
}

async function listServices(req, res, next) {
  try {
    const [services] = await pool.execute(`
      SELECT s.id, s.title, s.is_active, s.created_at, s.service_area,
             c.name AS category_name, gp.business_name,
             CONCAT(u.first_name, ' ', u.last_name) AS gardener_name
      FROM services s
      JOIN users u ON u.id = s.gardener_id
      JOIN gardener_profiles gp ON gp.user_id = s.gardener_id
      JOIN service_categories c ON c.id = s.category_id
      ORDER BY s.created_at DESC LIMIT 100
    `)
    return res.json({ services })
  } catch (error) { return next(error) }
}

async function updateServiceStatus(req, res, next) {
  const serviceId = Number(req.params.serviceId)
  if (!Number.isInteger(serviceId) || serviceId < 1) return res.status(400).json({ message: 'A valid service is required.' })
  try {
    const isActive = req.body.isActive === true || req.body.isActive === 'true'
    const [result] = await pool.execute('UPDATE services SET is_active = ? WHERE id = ?', [isActive, serviceId])
    if (!result.affectedRows) return res.status(404).json({ message: 'Service was not found.' })
    return res.json({ status: 'ok' })
  } catch (error) { return next(error) }
}

async function listActivity(req, res, next) {
  try {
    const [inquiries] = await pool.execute(`
      SELECT i.id, i.subject, i.status, i.created_at,
             CONCAT(c.first_name, ' ', c.last_name) AS client_name,
             gp.business_name AS gardener_name
      FROM inquiries i JOIN users c ON c.id = i.client_id
      JOIN gardener_profiles gp ON gp.user_id = i.gardener_id
      ORDER BY i.created_at DESC LIMIT 100
    `)
    const [bookings] = await pool.execute(`
      SELECT b.id, b.status, b.scheduled_start, b.scheduled_end,
             s.title AS service_title,
             CONCAT(c.first_name, ' ', c.last_name) AS client_name,
             gp.business_name AS gardener_name
      FROM bookings b JOIN users c ON c.id = b.client_id
      JOIN gardener_profiles gp ON gp.user_id = b.gardener_id
      LEFT JOIN services s ON s.id = b.service_id
      ORDER BY b.requested_at DESC LIMIT 100
    `)
    return res.json({ inquiries, bookings })
  } catch (error) { return next(error) }
}

async function listReports(req, res, next) {
  try {
    const [reports] = await pool.execute(`
      SELECT r.id, r.reason, r.details, r.status, r.created_at,
             CONCAT(u.first_name, ' ', u.last_name) AS reporter_name
      FROM reports r JOIN users u ON u.id = r.reporter_id
      ORDER BY r.created_at DESC LIMIT 100
    `)
    return res.json({ reports })
  } catch (error) { return next(error) }
}

async function updateReport(req, res, next) {
  const reportId = Number(req.params.reportId)
  const status = typeof req.body.status === 'string' ? req.body.status.trim() : ''
  if (!Number.isInteger(reportId) || reportId < 1 || !['reviewing', 'resolved', 'dismissed'].includes(status)) return res.status(400).json({ message: 'A valid report status is required.' })
  try {
    const [result] = await pool.execute(
      'UPDATE reports SET status = ?, resolved_by = ?, resolved_at = IF(? IN ("resolved", "dismissed"), CURRENT_TIMESTAMP, NULL) WHERE id = ?',
      [status, req.user.id, status, reportId],
    )
    if (!result.affectedRows) return res.status(404).json({ message: 'Report was not found.' })
    return res.json({ status })
  } catch (error) { return next(error) }
}

module.exports = {
  createCategory,
  getSummary,
  listPendingGardeners,
  listActivity,
  listCategories,
  listReports,
  listServices,
  updateUserStatus,
  updateCategory,
  updateGardenerApproval,
  updateReport,
  updateServiceStatus,
}
