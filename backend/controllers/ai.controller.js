const { MAX_INPUT_LENGTH, generateGardenPlan } = require('../services/ai.service')

const requestWindows = new Map()
const WINDOW_MS = 60 * 60 * 1000
const MAX_REQUESTS_PER_WINDOW = 10

function getRateLimitKey(req) {
  return `user:${req.user.id}`
}

function checkRateLimit(key) {
  const now = Date.now()
  const current = requestWindows.get(key)
  if (!current || now - current.startedAt >= WINDOW_MS) {
    requestWindows.set(key, { startedAt: now, count: 1 })
    return true
  }
  if (current.count >= MAX_REQUESTS_PER_WINDOW) return false
  current.count += 1
  return true
}

async function createGardenPlan(req, res, next) {
  const input = typeof req.body.input === 'string' ? req.body.input.trim() : ''
  if (!input || input.length > MAX_INPUT_LENGTH) {
    return res.status(400).json({ message: `Please provide a request between 1 and ${MAX_INPUT_LENGTH} characters.` })
  }
  if (!checkRateLimit(getRateLimitKey(req))) {
    return res.status(429).json({ message: 'Assistant usage is limited to 10 requests per hour. Please try again later.' })
  }

  try {
    const answer = await generateGardenPlan(input)
    return res.json({
      answer,
      disclaimer: 'AI suggestions are informational and may require verification from a qualified local gardening professional.',
    })
  } catch (error) {
    if (error.message === 'GEMINI_API_KEY is not configured.') {
      return res.status(503).json({ message: 'The Garden Planning Assistant is not configured. Add GEMINI_API_KEY to backend/.env and restart the backend.' })
    }
    if (error.name === 'AbortError') return res.status(504).json({ message: 'The AI provider took too long to respond. Please try again.' })
    if ([400, 401, 403].includes(error.providerStatus)) return res.status(502).json({ message: 'The AI provider rejected the configured credentials. Check GEMINI_API_KEY.' })
    if (error.providerStatus === 429) return res.status(503).json({ message: 'The AI provider rate limit or quota was reached. Please try again later.' })
    if (error.providerStatus === 503) return res.status(503).json({ message: 'The AI provider is temporarily busy. Please try again later.' })
    if (error.providerStatus === 404) return res.status(503).json({ message: 'The configured AI model is unavailable. Set GEMINI_MODEL to an available Gemini model and restart the backend.' })
    return next(error)
  }
}

module.exports = { createGardenPlan }
