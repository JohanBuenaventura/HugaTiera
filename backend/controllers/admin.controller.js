const { pool } = require('../config/database')
const { createNotification } = require('../services/notification.service')
const { avatarsDirectory, removeFileIfExists } = require('../middleware/upload.middleware')
const {
  calculateAge,
  formatDateOnly,
  validateDateOfBirth,
  validateMobileNumber,
  validateNameParts,
} = require('../utils/userProfile')

function formatAdminUserRow(row) {
  const dateOfBirth = formatDateOnly(row.date_of_birth)
  return {
    ...row,
    middle_name: row.middle_name || null,
    date_of_birth: dateOfBirth,
    age: calculateAge(dateOfBirth),
  }
}

async function getSummary(req, res, next) {
  try {
    const [counts] = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM users WHERE (role = 'client' OR can_act_as_client = TRUE) AND is_active = TRUE) AS clients,
        (SELECT COUNT(*) FROM users WHERE (role = 'gardener' OR can_act_as_gardener = TRUE) AND is_active = TRUE) AS gardeners,
        (SELECT COUNT(*) FROM users WHERE role = 'clerk' AND is_active = TRUE) AS clerks,
        (SELECT COUNT(*) FROM services WHERE is_active = TRUE) AS services,
        (SELECT COUNT(*) FROM bookings) AS bookings,
        (SELECT COUNT(*) FROM reports WHERE status IN ('open', 'reviewing')) AS open_reports,
        (SELECT COUNT(*) FROM gardener_profiles WHERE is_approved = FALSE) AS pending_gardeners
    `)
    const [users] = await pool.query(
      'SELECT id, email, role, can_act_as_client, can_act_as_gardener, first_name, middle_name, last_name, phone, date_of_birth, avatar_path, is_active, created_at FROM users ORDER BY created_at DESC LIMIT 100',
    )

    return res.json({ counts: counts[0], users: users.map(formatAdminUserRow) })
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
      WHERE (u.role = 'gardener' OR u.can_act_as_gardener = TRUE) AND gp.is_approved = FALSE
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
       WHERE gp.user_id = ? AND (u.role = 'gardener' OR u.can_act_as_gardener = TRUE)`,
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
    const [categories] = await pool.execute(
      'SELECT id, name, description, rate_per_sqm_min, rate_per_sqm_max, min_base_fee, is_active, created_at FROM service_categories ORDER BY name',
    )
    return res.json({ categories })
  } catch (error) { return next(error) }
}

async function createCategory(req, res, next) {
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : ''
  const description = typeof req.body.description === 'string' ? req.body.description.trim() : null
  const rateMin = req.body.ratePerSqmMin !== undefined && req.body.ratePerSqmMin !== '' ? Number(req.body.ratePerSqmMin) : 60
  const rateMax = req.body.ratePerSqmMax !== undefined && req.body.ratePerSqmMax !== '' ? Number(req.body.ratePerSqmMax) : Math.max(120, rateMin)
  const minBaseFee = req.body.minBaseFee !== undefined && req.body.minBaseFee !== '' ? Number(req.body.minBaseFee) : 450
  if (!name || name.length > 100) return res.status(400).json({ message: 'Category name is required and must be 100 characters or fewer.' })
  if (!Number.isFinite(rateMin) || rateMin <= 0 || !Number.isFinite(rateMax) || rateMax < rateMin || !Number.isFinite(minBaseFee) || minBaseFee < 0) {
    return res.status(400).json({ message: 'Category per-sq.m rates and minimum base fee must be valid positive numbers.' })
  }
  try {
    const [result] = await pool.execute(
      'INSERT INTO service_categories (name, description, rate_per_sqm_min, rate_per_sqm_max, min_base_fee) VALUES (?, ?, ?, ?, ?)',
      [name, description || null, rateMin, rateMax, minBaseFee],
    )
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
  const hasRates = req.body.ratePerSqmMin !== undefined || req.body.ratePerSqmMax !== undefined || req.body.minBaseFee !== undefined
  if (!Number.isInteger(categoryId) || categoryId < 1 || !name || name.length > 100) return res.status(400).json({ message: 'Valid category details are required.' })
  try {
    let result
    if (hasRates) {
      const rateMin = Number(req.body.ratePerSqmMin)
      const rateMax = Number(req.body.ratePerSqmMax)
      const minBaseFee = Number(req.body.minBaseFee)
      if (!Number.isFinite(rateMin) || rateMin <= 0 || !Number.isFinite(rateMax) || rateMax < rateMin || !Number.isFinite(minBaseFee) || minBaseFee < 0) {
        return res.status(400).json({ message: 'Category per-sq.m rates and minimum base fee must be valid positive numbers.' })
      }
      ;[result] = await pool.execute(
        'UPDATE service_categories SET name = ?, description = ?, rate_per_sqm_min = ?, rate_per_sqm_max = ?, min_base_fee = ?, is_active = ? WHERE id = ?',
        [name, description || null, rateMin, rateMax, minBaseFee, isActive, categoryId],
      )
    } else {
      ;[result] = await pool.execute('UPDATE service_categories SET name = ?, description = ?, is_active = ? WHERE id = ?', [name, description || null, isActive, categoryId])
    }
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
             COALESCE(NULLIF(TRIM(gp.business_name), ''), CONCAT(u.first_name, ' ', u.last_name)) AS gardener_name
      FROM services s
      JOIN users u ON u.id = s.gardener_id
      LEFT JOIN gardener_profiles gp ON gp.user_id = s.gardener_id
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
      SELECT i.id, i.request_type, i.subject, i.status, i.created_at,
             CONCAT(c.first_name, ' ', c.last_name) AS client_name,
             COALESCE(
               NULLIF(TRIM(gp.business_name), ''),
               CONCAT(gu.first_name, ' ', gu.last_name),
               CASE WHEN i.request_type = 'general' THEN 'Open Board' ELSE 'Unassigned' END
             ) AS gardener_name
      FROM inquiries i
      JOIN users c ON c.id = i.client_id
      LEFT JOIN users gu ON gu.id = i.gardener_id
      LEFT JOIN gardener_profiles gp ON gp.user_id = i.gardener_id
      ORDER BY i.created_at DESC LIMIT 100
    `)
    const [bookings] = await pool.execute(`
      SELECT b.id, b.status, b.scheduled_start, b.scheduled_end,
             s.title AS service_title,
             CONCAT(c.first_name, ' ', c.last_name) AS client_name,
             COALESCE(NULLIF(TRIM(gp.business_name), ''), CONCAT(gu.first_name, ' ', gu.last_name)) AS gardener_name
      FROM bookings b
      JOIN users c ON c.id = b.client_id
      JOIN users gu ON gu.id = b.gardener_id
      LEFT JOIN gardener_profiles gp ON gp.user_id = b.gardener_id
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

async function updateUser(req, res, next) {
  const userId = Number(req.params.userId)
  if (!Number.isInteger(userId) || userId < 1) {
    return res.status(400).json({ message: 'A valid user is required.' })
  }

  const names = validateNameParts({
    firstName: req.body.firstName,
    middleName: req.body.middleName,
    lastName: req.body.lastName,
  })
  if (names.error) {
    return res.status(400).json({ message: names.error })
  }

  const phoneResult = validateMobileNumber(req.body.phone, { required: false })
  if (phoneResult.error) {
    return res.status(400).json({ message: phoneResult.error })
  }

  const hasMiddleName = req.body.middleName !== undefined
  const hasDateOfBirth = req.body.dateOfBirth !== undefined
  let nextDobValue = null
  if (hasDateOfBirth) {
    const dobResult = validateDateOfBirth(req.body.dateOfBirth, { required: false })
    if (dobResult.error) {
      return res.status(400).json({ message: dobResult.error })
    }
    nextDobValue = dobResult.dateOfBirth
  }

  const role = typeof req.body.role === 'string' ? req.body.role.trim() : ''
  const isActive = req.body.isActive === undefined ? true : (req.body.isActive === true || req.body.isActive === 'true')

  if (!['client', 'gardener', 'clerk', 'administrator'].includes(role)) {
    return res.status(400).json({ message: 'Role must be client, gardener, clerk, or administrator.' })
  }
  if (userId === req.user.id && (role !== 'administrator' || !isActive)) {
    return res.status(400).json({ message: 'You cannot demote or deactivate your own administrator account.' })
  }

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [existing] = await connection.execute(
      'SELECT id, middle_name, date_of_birth, can_act_as_client, can_act_as_gardener FROM users WHERE id = ? LIMIT 1',
      [userId],
    )
    if (!existing.length) {
      await connection.rollback()
      return res.status(404).json({ message: 'User was not found.' })
    }

    const finalMiddleName = hasMiddleName ? names.middleName : existing[0].middle_name
    const finalDateOfBirth = hasDateOfBirth ? nextDobValue : formatDateOnly(existing[0].date_of_birth)
    const nextCanClient = req.body.canActAsClient !== undefined
      ? Boolean(req.body.canActAsClient === true || req.body.canActAsClient === 'true')
      : (role === 'client' ? true : (role === 'clerk' || role === 'administrator' ? false : Boolean(existing[0].can_act_as_client)))
    const nextCanGardener = req.body.canActAsGardener !== undefined
      ? Boolean(req.body.canActAsGardener === true || req.body.canActAsGardener === 'true')
      : (role === 'gardener' ? true : (role === 'clerk' || role === 'administrator' ? false : Boolean(existing[0].can_act_as_gardener)))

    await connection.execute(
      `UPDATE users
       SET first_name = ?, middle_name = ?, last_name = ?, phone = ?, date_of_birth = ?,
           role = ?, can_act_as_client = ?, can_act_as_gardener = ?, is_active = ?
       WHERE id = ?`,
      [
        names.firstName,
        finalMiddleName,
        names.lastName,
        phoneResult.phone,
        finalDateOfBirth,
        role,
        nextCanClient ? 1 : 0,
        nextCanGardener ? 1 : 0,
        isActive,
        userId,
      ],
    )
    if (role === 'client' || nextCanClient) {
      await connection.execute('INSERT IGNORE INTO client_profiles (user_id) VALUES (?)', [userId])
    }
    if (role === 'gardener' || nextCanGardener) {
      await connection.execute('INSERT IGNORE INTO gardener_profiles (user_id) VALUES (?)', [userId])
    }

    const [rows] = await connection.execute(
      'SELECT id, email, role, can_act_as_client, can_act_as_gardener, first_name, middle_name, last_name, phone, date_of_birth, avatar_path, is_active, created_at FROM users WHERE id = ? LIMIT 1',
      [userId],
    )
    await connection.commit()
    return res.json({ user: formatAdminUserRow(rows[0]) })
  } catch (error) {
    await connection.rollback()
    return next(error)
  } finally {
    connection.release()
  }
}

async function deleteUser(req, res, next) {
  const userId = Number(req.params.userId)
  if (!Number.isInteger(userId) || userId < 1) {
    return res.status(400).json({ message: 'A valid user is required.' })
  }
  if (userId === req.user.id) {
    return res.status(400).json({ message: 'You cannot delete your own administrator account.' })
  }

  try {
    const [rows] = await pool.execute('SELECT id, avatar_path FROM users WHERE id = ? LIMIT 1', [userId])
    if (!rows.length) {
      return res.status(404).json({ message: 'User was not found.' })
    }
    const avatarPath = rows[0].avatar_path

    await pool.execute('DELETE FROM users WHERE id = ?', [userId])
    await removeFileIfExists(avatarsDirectory, avatarPath)
    return res.status(204).send()
  } catch (error) {
    if (error.code === 'ER_ROW_IS_REFERENCED_2' || error.errno === 1451) {
      return res.status(409).json({
        message: 'This account has existing inquiries, bookings, or records and cannot be deleted. Deactivate the account instead.',
      })
    }
    return next(error)
  }
}

const ALLOWED_ADDON_TYPES = new Set(['plant', 'material', 'equipment', 'disposal'])

async function listPricingAddons(req, res, next) {
  try {
    const [addons] = await pool.execute(
      `SELECT id, name, item_type, unit, unit_price_min, unit_price_max, description, is_active, created_at, updated_at
       FROM pricing_addons
       ORDER BY FIELD(item_type, 'plant', 'material', 'equipment', 'disposal'), name`,
    )
    return res.json({ addons })
  } catch (error) { return next(error) }
}

async function createPricingAddon(req, res, next) {
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : ''
  const itemType = typeof req.body.itemType === 'string' ? req.body.itemType.trim().toLowerCase() : 'material'
  const unit = typeof req.body.unit === 'string' && req.body.unit.trim() ? req.body.unit.trim() : 'per item'
  const unitPriceMin = Number(req.body.unitPriceMin)
  const unitPriceMax = Number(req.body.unitPriceMax)
  const description = typeof req.body.description === 'string' && req.body.description.trim() ? req.body.description.trim() : null

  if (!name || name.length > 120) return res.status(400).json({ message: 'Item name is required and must be 120 characters or fewer.' })
  if (!ALLOWED_ADDON_TYPES.has(itemType)) return res.status(400).json({ message: 'Item type must be plant, material, equipment, or disposal.' })
  if (unit.length > 40) return res.status(400).json({ message: 'Unit label must be 40 characters or fewer.' })
  if (!Number.isFinite(unitPriceMin) || unitPriceMin < 0 || !Number.isFinite(unitPriceMax) || unitPriceMax < unitPriceMin) {
    return res.status(400).json({ message: 'Valid min and max unit prices (max >= min) are required.' })
  }
  if (description && description.length > 255) return res.status(400).json({ message: 'Description must be 255 characters or fewer.' })

  try {
    const [result] = await pool.execute(
      `INSERT INTO pricing_addons (name, item_type, unit, unit_price_min, unit_price_max, description)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [name, itemType, unit, unitPriceMin, unitPriceMax, description],
    )
    return res.status(201).json({ id: result.insertId })
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'A pricing item with this name already exists.' })
    return next(error)
  }
}

async function updatePricingAddon(req, res, next) {
  const addonId = Number(req.params.addonId)
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : ''
  const itemType = typeof req.body.itemType === 'string' ? req.body.itemType.trim().toLowerCase() : 'material'
  const unit = typeof req.body.unit === 'string' && req.body.unit.trim() ? req.body.unit.trim() : 'per item'
  const unitPriceMin = Number(req.body.unitPriceMin)
  const unitPriceMax = Number(req.body.unitPriceMax)
  const description = typeof req.body.description === 'string' && req.body.description.trim() ? req.body.description.trim() : null
  const isActive = req.body.isActive === undefined ? true : (req.body.isActive === true || req.body.isActive === 'true')

  if (!Number.isInteger(addonId) || addonId < 1 || !name || name.length > 120) {
    return res.status(400).json({ message: 'Valid pricing item details are required.' })
  }
  if (!ALLOWED_ADDON_TYPES.has(itemType)) return res.status(400).json({ message: 'Item type must be plant, material, equipment, or disposal.' })
  if (unit.length > 40) return res.status(400).json({ message: 'Unit label must be 40 characters or fewer.' })
  if (!Number.isFinite(unitPriceMin) || unitPriceMin < 0 || !Number.isFinite(unitPriceMax) || unitPriceMax < unitPriceMin) {
    return res.status(400).json({ message: 'Valid min and max unit prices (max >= min) are required.' })
  }
  if (description && description.length > 255) return res.status(400).json({ message: 'Description must be 255 characters or fewer.' })

  try {
    const [result] = await pool.execute(
      `UPDATE pricing_addons
       SET name = ?, item_type = ?, unit = ?, unit_price_min = ?, unit_price_max = ?, description = ?, is_active = ?
       WHERE id = ?`,
      [name, itemType, unit, unitPriceMin, unitPriceMax, description, isActive, addonId],
    )
    if (!result.affectedRows) return res.status(404).json({ message: 'Pricing item was not found.' })
    return res.json({ status: 'ok' })
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'A pricing item with this name already exists.' })
    return next(error)
  }
}

async function listClerkAssignments(req, res, next) {
  try {
    const [clerks] = await pool.execute(
      `SELECT id, email, first_name, last_name, is_active
       FROM users
       WHERE role = 'clerk' AND is_active = TRUE
       ORDER BY first_name, last_name`,
    )
    const [gardeners] = await pool.execute(
      `SELECT u.id, u.email, u.first_name, u.last_name, gp.business_name, gp.is_approved
       FROM users u
       JOIN gardener_profiles gp ON gp.user_id = u.id
       WHERE (u.role = 'gardener' OR u.can_act_as_gardener = TRUE) AND u.is_active = TRUE
       ORDER BY COALESCE(NULLIF(TRIM(gp.business_name), ''), u.first_name)`,
    )
    const [assignments] = await pool.execute(
      `SELECT cga.id, cga.clerk_id, cga.gardener_id, cga.notes, cga.created_at,
              CONCAT(c.first_name, ' ', c.last_name) AS clerk_name, c.email AS clerk_email,
              COALESCE(NULLIF(TRIM(gp.business_name), ''), CONCAT(g.first_name, ' ', g.last_name)) AS gardener_name,
              g.email AS gardener_email
       FROM clerk_gardener_assignments cga
       JOIN users c ON c.id = cga.clerk_id
       JOIN users g ON g.id = cga.gardener_id
       LEFT JOIN gardener_profiles gp ON gp.user_id = g.id
       ORDER BY cga.created_at DESC, cga.id DESC`,
    )
    return res.json({ clerks, gardeners, assignments })
  } catch (error) {
    return next(error)
  }
}

async function createClerkAssignment(req, res, next) {
  const clerkId = Number(req.body.clerkId)
  const gardenerId = Number(req.body.gardenerId)
  const notes = typeof req.body.notes === 'string' && req.body.notes.trim() ? req.body.notes.trim() : null

  if (!Number.isInteger(clerkId) || clerkId < 1 || !Number.isInteger(gardenerId) || gardenerId < 1) {
    return res.status(400).json({ message: 'Valid clerk and gardener accounts are required.' })
  }
  if (clerkId === gardenerId) {
    return res.status(400).json({ message: 'Clerk and gardener must be different accounts.' })
  }
  if (notes && notes.length > 255) {
    return res.status(400).json({ message: 'Assignment notes must be 255 characters or fewer.' })
  }

  try {
    const [clerkRows] = await pool.execute(
      "SELECT id FROM users WHERE id = ? AND role = 'clerk' AND is_active = TRUE LIMIT 1",
      [clerkId],
    )
    if (!clerkRows[0]) {
      return res.status(400).json({ message: 'Selected account is not an active clerk.' })
    }
    const [gardenerRows] = await pool.execute(
      "SELECT u.id FROM users u JOIN gardener_profiles gp ON gp.user_id = u.id WHERE u.id = ? AND (u.role = 'gardener' OR u.can_act_as_gardener = TRUE) AND u.is_active = TRUE LIMIT 1",
      [gardenerId],
    )
    if (!gardenerRows[0]) {
      return res.status(400).json({ message: 'Selected account is not an active gardener.' })
    }

    const [ins] = await pool.execute(
      `INSERT INTO clerk_gardener_assignments (clerk_id, gardener_id, assigned_by, notes)
       VALUES (?, ?, ?, ?)`,
      [clerkId, gardenerId, req.user.id, notes],
    )

    await createNotification({
      userId: clerkId,
      type: 'clerk_assignment',
      title: 'Gardener assigned to you',
      message: 'An administrator assigned you to manage a gardener’s schedules, services, and payment verifications.',
      entityType: 'gardener_profile',
      entityId: gardenerId,
    }).catch(() => {})

    return res.status(201).json({ id: ins.insertId })
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'This clerk is already assigned to that gardener.' })
    }
    return next(error)
  }
}

async function deleteClerkAssignment(req, res, next) {
  const assignmentId = Number(req.params.assignmentId)
  if (!Number.isInteger(assignmentId) || assignmentId < 1) {
    return res.status(400).json({ message: 'A valid assignment ID is required.' })
  }
  try {
    const [resDel] = await pool.execute('DELETE FROM clerk_gardener_assignments WHERE id = ?', [assignmentId])
    if (!resDel.affectedRows) return res.status(404).json({ message: 'Clerk assignment was not found.' })
    return res.status(204).send()
  } catch (error) {
    return next(error)
  }
}

module.exports = {
  createCategory,
  createClerkAssignment,
  createPricingAddon,
  deleteClerkAssignment,
  deleteUser,
  getSummary,
  listClerkAssignments,
  listPendingGardeners,
  listActivity,
  listCategories,
  listPricingAddons,
  listReports,
  listServices,
  updateUser,
  updateUserStatus,
  updateCategory,
  updateGardenerApproval,
  updatePricingAddon,
  updateReport,
  updateServiceStatus,
}
