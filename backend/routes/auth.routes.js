const express = require('express')
const {
  currentUser,
  enableDualRole,
  login,
  logout,
  register,
  switchRole,
} = require('../controllers/auth.controller')
const { requireAuth, requireRole } = require('../middleware/auth.middleware')
const { createRateLimiter } = require('../middleware/rateLimit.middleware')

const router = express.Router()

const loginAccountLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 15,
  keyGenerator: (req) => `login:${req.ip || 'local'}:${String(req.body?.email || '').trim().toLowerCase()}`,
  message: 'Too many sign-in attempts for this account. Please wait 15 minutes and try again.',
})

const registerIpLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 40,
  keyGenerator: (req) => `register:${req.ip || 'local'}`,
  message: 'Too many registration attempts from this network. Please wait a few minutes and try again.',
})

router.post('/register', registerIpLimiter, register)
router.post('/login', loginAccountLimiter, login)
router.post('/logout', logout)
router.get('/me', requireAuth, currentUser)
router.post('/switch-role', requireAuth, switchRole)
router.post('/enable-dual-role', requireAuth, requireRole('client', 'gardener'), enableDualRole)
router.get('/administrator-check', requireAuth, requireRole('administrator'), (req, res) => {
  res.json({ status: 'ok' })
})

module.exports = router
