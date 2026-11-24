const { pool } = require('../config/database')
const {
  processAndSavePortfolioImage,
  removeFileIfExists,
  resolveContainedPath,
  uploadDirectory,
} = require('../middleware/upload.middleware')

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

async function listMyPortfolio(req, res, next) {
  try {
    const [portfolios] = await pool.execute(
      'SELECT id, title, description, image_path, created_at FROM portfolios WHERE gardener_id = ? ORDER BY created_at DESC',
      [req.user.id],
    )
    return res.json({ portfolios })
  } catch (error) {
    return next(error)
  }
}

async function createPortfolio(req, res, next) {
  const title = text(req.body.title)
  const description = text(req.body.description) || null
  if (!req.file || !req.file.buffer) return res.status(400).json({ message: 'A portfolio image is required.' })
  if (!title || title.length > 150) {
    return res.status(400).json({ message: 'A portfolio title between 1 and 150 characters is required.' })
  }

  let saved = null
  try {
    saved = await processAndSavePortfolioImage(req.file.buffer, req.user.id)
    const [result] = await pool.execute(
      'INSERT INTO portfolios (gardener_id, title, description, image_path) VALUES (?, ?, ?, ?)',
      [req.user.id, title, description, saved.relativePath],
    )
    return res.status(201).json({ id: result.insertId })
  } catch (error) {
    if (saved) await removeFileIfExists(uploadDirectory, saved.relativePath)
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message })
    return next(error)
  }
}

async function updatePortfolio(req, res, next) {
  const title = text(req.body.title)
  const description = text(req.body.description) || null
  if (!title || title.length > 150) return res.status(400).json({ message: 'A portfolio title between 1 and 150 characters is required.' })

  try {
    const [result] = await pool.execute(
      'UPDATE portfolios SET title = ?, description = ? WHERE id = ? AND gardener_id = ?',
      [title, description, Number(req.params.portfolioId), req.user.id],
    )
    if (!result.affectedRows) return res.status(404).json({ message: 'Portfolio entry was not found or is not owned by you.' })
    return res.json({ status: 'ok' })
  } catch (error) {
    return next(error)
  }
}

async function deletePortfolio(req, res, next) {
  try {
    const [entries] = await pool.execute(
      'SELECT image_path FROM portfolios WHERE id = ? AND gardener_id = ? LIMIT 1',
      [Number(req.params.portfolioId), req.user.id],
    )
    if (!entries[0]) return res.status(404).json({ message: 'Portfolio entry was not found or is not owned by you.' })
    await pool.execute('DELETE FROM portfolios WHERE id = ? AND gardener_id = ?', [Number(req.params.portfolioId), req.user.id])
    await removeFileIfExists(uploadDirectory, entries[0].image_path)
    return res.status(204).send()
  } catch (error) {
    return next(error)
  }
}

async function sendPortfolioImage(req, res, next) {
  try {
    const [entries] = await pool.execute(
      'SELECT image_path FROM portfolios WHERE id = ? LIMIT 1',
      [Number(req.params.portfolioId)],
    )
    if (!entries[0]) return res.status(404).json({ message: 'Portfolio image was not found.' })
    const absolutePath = resolveContainedPath(uploadDirectory, entries[0].image_path)
    return res.sendFile(absolutePath, (error) => {
      if (error && !res.headersSent) {
        return res.status(404).json({ message: 'Portfolio image file was not found.' })
      }
      return undefined
    })
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message })
    return next(error)
  }
}

module.exports = {
  createPortfolio,
  deletePortfolio,
  listMyPortfolio,
  sendPortfolioImage,
  updatePortfolio,
}
