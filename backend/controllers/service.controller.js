const { pool } = require('../config/database')

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function serviceValues(body) {
  const title = text(body.title)
  const description = text(body.description)
  const categoryId = Number(body.categoryId)
  const indicativePrice = body.indicativePrice === '' || body.indicativePrice === null
    ? null
    : Number(body.indicativePrice)
  const priceUnit = text(body.priceUnit) || null
  const serviceArea = text(body.serviceArea) || 'Zamboanga City'

  if (!title || title.length > 150) return { error: 'A service title between 1 and 150 characters is required.' }
  if (!description) return { error: 'A service description is required.' }
  if (!Number.isInteger(categoryId) || categoryId < 1) return { error: 'A valid service category is required.' }
  if (indicativePrice !== null && (!Number.isFinite(indicativePrice) || indicativePrice < 0)) return { error: 'Indicative price must be a positive number.' }
  if (priceUnit && priceUnit.length > 50) return { error: 'Price unit is too long.' }
  if (serviceArea.length > 150) return { error: 'Service area is too long.' }

  return { title, description, categoryId, indicativePrice, priceUnit, serviceArea }
}

async function listCategories(req, res, next) {
  try {
    const [categories] = await pool.execute(
      'SELECT id, name, description FROM service_categories WHERE is_active = TRUE ORDER BY name',
    )
    return res.json({ categories })
  } catch (error) {
    return next(error)
  }
}

async function listServices(req, res, next) {
  const keyword = text(req.query.keyword)
  const categoryId = Number(req.query.categoryId)
  const serviceArea = text(req.query.serviceArea)
  const sort = req.query.sort === 'price_low' || req.query.sort === 'price_high' ? req.query.sort : 'newest'
  const page = Math.max(Number(req.query.page) || 1, 1)
  const limit = Math.min(Math.max(Number(req.query.limit) || 12, 1), 50)
  const offset = (page - 1) * limit
  const conditions = ['s.is_active = TRUE', 'u.is_active = TRUE', 'gp.is_approved = TRUE', 'c.is_active = TRUE']
  const params = []

  if (keyword) {
    conditions.push('(s.title LIKE ? OR s.description LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ? OR gp.business_name LIKE ? OR c.name LIKE ?)')
    const pattern = `%${keyword}%`
    params.push(pattern, pattern, pattern, pattern, pattern, pattern)
  }
  if (Number.isInteger(categoryId) && categoryId > 0) {
    conditions.push('s.category_id = ?')
    params.push(categoryId)
  }
  if (serviceArea) {
    conditions.push('s.service_area LIKE ?')
    params.push(`%${serviceArea}%`)
  }

  const orderBy = sort === 'price_low'
    ? 's.indicative_price IS NULL, s.indicative_price ASC'
    : sort === 'price_high'
      ? 's.indicative_price IS NULL, s.indicative_price DESC'
      : 's.created_at DESC'

  try {
    const [services] = await pool.execute(`
      SELECT s.id, s.title, s.description, s.indicative_price, s.price_unit,
             s.service_area, s.category_id, c.name AS category_name,
             s.gardener_id, u.first_name, u.last_name, gp.business_name
      FROM services s
      JOIN users u ON u.id = s.gardener_id
      JOIN gardener_profiles gp ON gp.user_id = u.id
      JOIN service_categories c ON c.id = s.category_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `, [...params, limit, offset])
    const [totalRows] = await pool.execute(`
      SELECT COUNT(*) AS total
      FROM services s
      JOIN users u ON u.id = s.gardener_id
      JOIN gardener_profiles gp ON gp.user_id = u.id
      JOIN service_categories c ON c.id = s.category_id
      WHERE ${conditions.join(' AND ')}
    `, params)
    return res.json({ services, pagination: { page, limit, total: totalRows[0].total, pages: Math.ceil(totalRows[0].total / limit) } })
  } catch (error) {
    return next(error)
  }

}

async function getGardener(req, res, next) {
  try {
    const gardenerId = Number(req.params.gardenerId)
    const [gardeners] = await pool.execute(`
      SELECT u.id, u.first_name, u.last_name, gp.business_name, gp.description,
             gp.service_area, gp.years_of_experience
      FROM users u
      JOIN gardener_profiles gp ON gp.user_id = u.id
      WHERE u.id = ? AND u.role = 'gardener' AND u.is_active = TRUE AND gp.is_approved = TRUE
      LIMIT 1
    `, [gardenerId])
    if (!gardeners[0]) return res.status(404).json({ message: 'Gardener profile was not found.' })
    const [services] = await pool.execute(
      'SELECT id, title, description, indicative_price, price_unit, service_area, category_id FROM services WHERE gardener_id = ? AND is_active = TRUE ORDER BY created_at DESC',
      [gardenerId],
    )
    const [portfolios] = await pool.execute(
      'SELECT id, title, description FROM portfolios WHERE gardener_id = ? ORDER BY created_at DESC',
      [gardenerId],
    )
    const [reviews] = await pool.execute(
      `SELECT r.id, r.booking_id, r.rating, r.review_text, r.created_at,
              CONCAT(u.first_name, ' ', u.last_name) AS client_name
       FROM reviews r JOIN users u ON u.id = r.client_id
       WHERE r.gardener_id = ? AND r.is_visible = TRUE
       ORDER BY r.created_at DESC`,
      [gardenerId],
    )
    return res.json({ gardener: gardeners[0], services, portfolios, reviews })
  } catch (error) {
    return next(error)
  }
}

async function listMyServices(req, res, next) {
  try {
    const [services] = await pool.execute(`
      SELECT s.id, s.title, s.description, s.indicative_price, s.price_unit,
             s.service_area, s.category_id, c.name AS category_name, s.is_active
      FROM services s
      JOIN service_categories c ON c.id = s.category_id
      WHERE s.gardener_id = ?
      ORDER BY s.created_at DESC
    `, [req.user.id])
    return res.json({ services })
  } catch (error) {
    return next(error)
  }
}

async function getService(req, res, next) {
  const serviceId = Number(req.params.serviceId)
  if (!Number.isInteger(serviceId) || serviceId < 1) {
    return res.status(400).json({ message: 'A valid service is required.' })
  }
  try {
    const [services] = await pool.execute(`
      SELECT s.id, s.title, s.description, s.indicative_price, s.price_unit,
             s.service_area, c.name AS category_name, s.gardener_id,
             u.first_name, u.last_name, u.phone, gp.business_name, gp.description AS gardener_description
      FROM services s
      JOIN users u ON u.id = s.gardener_id AND u.is_active = TRUE
      JOIN gardener_profiles gp ON gp.user_id = u.id AND gp.is_approved = TRUE
      JOIN service_categories c ON c.id = s.category_id AND c.is_active = TRUE
      WHERE s.id = ? AND s.is_active = TRUE
      LIMIT 1
    `, [serviceId])
    if (!services[0]) return res.status(404).json({ message: 'Service was not found.' })

    const [portfolios] = await pool.execute(
      'SELECT id, title, description, image_path FROM portfolios WHERE gardener_id = ? ORDER BY created_at DESC',
      [services[0].gardener_id],
    )
    return res.json({ service: services[0], portfolios })
  } catch (error) {
    return next(error)
  }
}

async function createService(req, res, next) {
  const values = serviceValues(req.body)
  if (values.error) return res.status(400).json({ message: values.error })

  try {
    const [categories] = await pool.execute('SELECT id FROM service_categories WHERE id = ? AND is_active = TRUE', [values.categoryId])
    if (!categories[0]) return res.status(400).json({ message: 'The selected category is not available.' })
    const [result] = await pool.execute(
      'INSERT INTO services (gardener_id, category_id, title, description, indicative_price, price_unit, service_area) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [req.user.id, values.categoryId, values.title, values.description, values.indicativePrice, values.priceUnit, values.serviceArea],
    )
    return res.status(201).json({ id: result.insertId })
  } catch (error) {
    return next(error)
  }
}

async function updateService(req, res, next) {
  const values = serviceValues(req.body)
  if (values.error) return res.status(400).json({ message: values.error })

  try {
    const [result] = await pool.execute(
      'UPDATE services SET category_id = ?, title = ?, description = ?, indicative_price = ?, price_unit = ?, service_area = ? WHERE id = ? AND gardener_id = ? AND is_active = TRUE',
      [values.categoryId, values.title, values.description, values.indicativePrice, values.priceUnit, values.serviceArea, Number(req.params.serviceId), req.user.id],
    )
    if (!result.affectedRows) return res.status(404).json({ message: 'Service was not found or is not owned by you.' })
    return res.json({ status: 'ok' })
  } catch (error) {
    return next(error)
  }
}

async function deactivateService(req, res, next) {
  try {
    const [result] = await pool.execute(
      'UPDATE services SET is_active = FALSE WHERE id = ? AND gardener_id = ? AND is_active = TRUE',
      [Number(req.params.serviceId), req.user.id],
    )
    if (!result.affectedRows) return res.status(404).json({ message: 'Service was not found or is not owned by you.' })
    return res.status(204).send()
  } catch (error) {
    return next(error)
  }
}

module.exports = {
  createService,
  deactivateService,
  getService,
  getGardener,
  listCategories,
  listMyServices,
  listServices,
  updateService,
}
