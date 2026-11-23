function createRateLimiter({ windowMs = 15 * 60 * 1000, max = 30, keyGenerator, message = 'Too many requests. Please try again later.' } = {}) {
  const hits = new Map()

  const pruneInterval = setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of hits.entries()) {
      if (entry.resetAt <= now) hits.delete(key)
    }
  }, Math.min(windowMs, 5 * 60 * 1000))
  if (typeof pruneInterval.unref === 'function') pruneInterval.unref()

  return (req, res, next) => {
    const now = Date.now()
    const rawKey = typeof keyGenerator === 'function'
      ? keyGenerator(req)
      : (req.ip || req.socket?.remoteAddress || 'unknown')
    const key = String(rawKey || 'unknown')

    let entry = hits.get(key)
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs }
      hits.set(key, entry)
    }

    entry.count += 1
    if (entry.count > max) {
      const retryAfterSec = Math.max(1, Math.ceil((entry.resetAt - now) / 1000))
      res.set('Retry-After', String(retryAfterSec))
      return res.status(429).json({
        code: 'RATE_LIMITED',
        message,
      })
    }

    return next()
  }
}

module.exports = { createRateLimiter }
