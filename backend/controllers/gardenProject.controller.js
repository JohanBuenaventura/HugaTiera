const fs = require('fs/promises')
const { pool } = require('../config/database')
const { processAndSaveRequestImage, resolveRequestImagePath } = require('../middleware/upload.middleware')
const { generateGardenImage, generateGardenPlan } = require('../services/ai.service')
const { finalizeAiUsageSlot, reserveAiUsageSlot } = require('./ai.controller')
const { serializeRequestImage } = require('./requestImage.controller')

const DISCLAIMER = 'This design is an AI visualization and preliminary guidance. It may differ from the finished project; confirm scope, safety, plants, schedule, and price with a qualified provider.'

const idOf = (value) => Number.isInteger(Number(value)) && Number(value) > 0 ? Number(value) : null
const text = (value, limit) => typeof value === 'string' ? value.trim().slice(0, limit) : ''

function payload(body) {
  const result = {
    title: text(body.title, 200),
    description: text(body.description, 10000),
    preferredStyle: text(body.preferredStyle ?? body.preferred_style, 100) || null,
    gardenSize: text(body.gardenSize ?? body.garden_size, 100) || null,
    location: text(body.location, 255) || null,
    budgetMin: body.budgetMin === '' || body.budgetMin == null ? null : Number(body.budgetMin),
    budgetMax: body.budgetMax === '' || body.budgetMax == null ? null : Number(body.budgetMax),
  }
  if (!result.title || result.description.length < 10) throw Object.assign(new Error('A title and description of at least 10 characters are required.'), { statusCode: 400 })
  if (![result.budgetMin, result.budgetMax].every((value) => value === null || (Number.isFinite(value) && value >= 0))) {
    throw Object.assign(new Error('Budget values must be valid non-negative numbers.'), { statusCode: 400 })
  }
  if (result.budgetMin !== null && result.budgetMax !== null && result.budgetMin > result.budgetMax) {
    throw Object.assign(new Error('The minimum budget cannot be greater than the maximum budget.'), { statusCode: 400 })
  }
  return result
}

async function owned(projectId, userId) {
  const [rows] = await pool.execute(
    `SELECT id, client_id, title, description, preferred_style, budget_min, budget_max, garden_size,
            location, status, analysis_json, generation_error, ai_disclaimer, generated_at, created_at, updated_at
     FROM garden_projects WHERE id = ? AND client_id = ? LIMIT 1`,
    [projectId, userId],
  )
  return rows[0] || null
}

async function withImages(project) {
  const [rows] = await pool.execute(
    `SELECT id, inquiry_id, project_id, uploaded_by, kind, parent_image_id, mime_type, file_size, ai_description, created_at
     FROM request_images WHERE project_id = ? ORDER BY created_at, id`,
    [project.id],
  )
  return {
    ...project,
    analysis: typeof project.analysis_json === 'string' ? JSON.parse(project.analysis_json) : project.analysis_json,
    images: rows.map(serializeRequestImage),
  }
}

async function create(req, res, next) {
  try {
    const data = payload(req.body || {})
    const [result] = await pool.execute(
      `INSERT INTO garden_projects (client_id, title, description, preferred_style, budget_min, budget_max, garden_size, location, ai_disclaimer)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.id, data.title, data.description, data.preferredStyle, data.budgetMin, data.budgetMax, data.gardenSize, data.location, DISCLAIMER],
    )
    return res.status(201).json({ project: await withImages(await owned(result.insertId, req.user.id)) })
  } catch (error) { return next(error) }
}

async function list(req, res, next) {
  try {
    const [rows] = await pool.execute('SELECT * FROM garden_projects WHERE client_id = ? ORDER BY updated_at DESC, id DESC', [req.user.id])
    return res.json({ projects: rows.map((row) => ({ ...row, analysis: row.analysis_json })) })
  } catch (error) { return next(error) }
}

async function get(req, res, next) {
  const projectId = idOf(req.params.projectId)
  if (!projectId) return res.status(400).json({ message: 'A valid garden project ID is required.' })
  try {
    const project = await owned(projectId, req.user.id)
    if (!project) return res.status(404).json({ message: 'Garden project was not found.' })
    return res.json({ project: await withImages(project) })
  } catch (error) { return next(error) }
}

async function update(req, res, next) {
  const projectId = idOf(req.params.projectId)
  if (!projectId) return res.status(400).json({ message: 'A valid garden project ID is required.' })
  try {
    const current = await owned(projectId, req.user.id)
    if (!current) return res.status(404).json({ message: 'Garden project was not found.' })
    const data = payload({ ...current, ...req.body, preferredStyle: req.body.preferredStyle ?? current.preferred_style })
    await pool.execute(
      `UPDATE garden_projects SET title=?, description=?, preferred_style=?, budget_min=?, budget_max=?, garden_size=?, location=?, status='draft', generation_error=NULL WHERE id=? AND client_id=?`,
      [data.title, data.description, data.preferredStyle, data.budgetMin, data.budgetMax, data.gardenSize, data.location, projectId, req.user.id],
    )
    return res.json({ project: await withImages(await owned(projectId, req.user.id)) })
  } catch (error) { return next(error) }
}

async function remove(req, res, next) {
  const projectId = idOf(req.params.projectId)
  if (!projectId) return res.status(400).json({ message: 'A valid garden project ID is required.' })
  try {
    const [images] = await pool.execute('SELECT file_path FROM request_images WHERE project_id=?', [projectId])
    const [result] = await pool.execute('DELETE FROM garden_projects WHERE id=? AND client_id=?', [projectId, req.user.id])
    if (!result.affectedRows) return res.status(404).json({ message: 'Garden project was not found.' })
    await Promise.all(images.map((image) => fs.unlink(resolveRequestImagePath(image.file_path)).catch(() => {})))
    return res.status(204).send()
  } catch (error) { return next(error) }
}

async function generate(req, res, next) {
  const projectId = idOf(req.params.projectId)
  if (!projectId) return res.status(400).json({ message: 'A valid garden project ID is required.' })
  let usageId = null
  try {
    const project = await owned(projectId, req.user.id)
    if (!project) return res.status(404).json({ message: 'Garden project was not found.' })
    const [rows] = await pool.execute("SELECT * FROM request_images WHERE project_id=? AND kind='original' ORDER BY id LIMIT 1", [projectId])
    if (!rows[0]) return res.status(400).json({ message: 'Upload an original garden photo before generating a design.' })
    const cooldown = Number(process.env.AI_IMAGE_COOLDOWN_SECONDS) || 60
    const [[recent]] = await pool.execute(
      "SELECT created_at FROM request_images WHERE project_id=? AND kind='ai_generated' AND created_at >= DATE_SUB(NOW(), INTERVAL ? SECOND) ORDER BY created_at DESC LIMIT 1",
      [projectId, cooldown],
    )
    if (recent) return res.status(429).json({ message: `Please wait ${cooldown} seconds between image generations.` })
    if (String(process.env.AI_IMAGE_GENERATION_ENABLED).toLowerCase() !== 'true') {
      return res.status(501).json({ message: 'AI image generation is disabled. Configure AI_IMAGE_GENERATION_ENABLED=true on the backend after reviewing provider access and limits.' })
    }
    const usage = await reserveAiUsageSlot({
      userId: req.user.id,
      feature: 'image_generation',
      projectId,
      requestImageId: rows[0].id,
      model: process.env.AI_IMAGE_PROVIDER === 'comfyui' ? 'comfyui-local' : process.env.GEMINI_IMAGE_MODEL,
    })
    if (!usage.allowed) return res.status(429).json({ message: 'The hourly AI usage limit has been reached. Please try again later.', usage })
    usageId = usage.usageId
    await pool.execute("UPDATE garden_projects SET status='generating', generation_error=NULL WHERE id=?", [projectId])
    const generated = await generateGardenImage({
      imageBuffer: await fs.readFile(resolveRequestImagePath(rows[0].file_path)),
      mimeType: rows[0].mime_type,
      prompt: `Create a realistic after-visualization of this garden. Preserve perspective and existing structures. Apply: ${project.description}. Style: ${project.preferred_style || 'natural'}.`,
    })
    const saved = await processAndSaveRequestImage(generated.imageBuffer, req.user.id, 'ai_generated')
    const [result] = await pool.execute(
      `INSERT INTO request_images (project_id, uploaded_by, kind, parent_image_id, file_path, mime_type, file_size, ai_description)
       VALUES (?, ?, 'ai_generated', ?, ?, ?, ?, ?)`,
      [projectId, req.user.id, rows[0].id, saved.relativePath, saved.mimeType, saved.fileSize, 'AI-generated garden visualization'],
    )
    await pool.execute("UPDATE garden_projects SET status='ready', generated_at=NOW(), ai_disclaimer=? WHERE id=?", [DISCLAIMER, projectId])
    await finalizeAiUsageSlot(usageId, { outcome: 'success', model: generated.model })
    return res.status(201).json({ image: serializeRequestImage({ id: result.insertId, project_id: projectId, uploaded_by: req.user.id, kind: 'ai_generated', parent_image_id: rows[0].id, mime_type: saved.mimeType, file_size: saved.fileSize, ai_description: 'AI-generated garden visualization' }), disclaimer: DISCLAIMER })
  } catch (error) {
    if (usageId) {
      await finalizeAiUsageSlot(usageId, { outcome: 'error', errorCode: error.code || 'IMAGE_GENERATION_FAILED' }).catch(() => {})
    }
    await pool.execute("UPDATE garden_projects SET status='failed', generation_error=? WHERE id=?", [String(error.message).slice(0, 255), projectId]).catch(() => {})
    return next(error)
  }
}

async function analyze(req, res, next) {
  const projectId = idOf(req.params.projectId)
  if (!projectId) return res.status(400).json({ message: 'A valid garden project ID is required.' })
  try {
    const project = await owned(projectId, req.user.id)
    if (!project) return res.status(404).json({ message: 'Garden project was not found.' })
    const answer = await generateGardenPlan(
      `Return a concise structured analysis for this garden project. Include recommended style, plants, materials, improvements, complexity, maintenance, challenges, and a preliminary budget range. State that a photo cannot determine exact dimensions, safety, plant health, or final price. Project: ${project.description}. Style: ${project.preferred_style || 'not specified'}. Budget: ${project.budget_min || 'not specified'}-${project.budget_max || 'not specified'}.`,
    )
    await pool.execute('UPDATE garden_projects SET analysis_json=? WHERE id=?', [JSON.stringify({ summary: answer }), projectId])
    return res.json({ analysis: { summary: answer } })
  } catch (error) { return next(error) }
}

async function matches(req, res, next) {
  const projectId = idOf(req.params.projectId)
  if (!projectId) return res.status(400).json({ message: 'A valid garden project ID is required.' })
  try {
    const project = await owned(projectId, req.user.id)
    if (!project) return res.status(404).json({ message: 'Garden project was not found.' })
    const [rows] = await pool.execute(
      `SELECT gp.user_id AS gardener_id, COALESCE(gp.business_name, CONCAT(u.first_name, ' ', u.last_name)) AS business_name,
              gp.service_area, AVG(r.rating) AS rating
       FROM gardener_profiles gp JOIN users u ON u.id=gp.user_id
       LEFT JOIN reviews r ON r.gardener_id=gp.user_id AND r.is_visible=1
       WHERE gp.is_approved=1 AND (? IS NULL OR LOWER(gp.service_area) LIKE CONCAT('%', LOWER(?), '%'))
       GROUP BY gp.user_id, gp.business_name, u.first_name, u.last_name, gp.service_area
       ORDER BY rating DESC LIMIT 20`,
      [project.location, project.location],
    )
    const result = rows.map((row) => ({
      ...row,
      rating: row.rating ? Number(row.rating) : null,
      suitability: 'requires_consultation',
      rationale: 'This provider is in the requested service area. The provider must review the project and confirm feasibility.',
    }))
    return res.json({ matches: result })
  } catch (error) { return next(error) }
}

module.exports = { analyze, create, delete: remove, generate, get, list, matches, update }
