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

const router = express.Router()

router.post('/register', register)
router.post('/login', login)
router.post('/logout', logout)
router.get('/me', requireAuth, currentUser)
router.post('/switch-role', requireAuth, switchRole)
router.post('/enable-dual-role', requireAuth, requireRole('client', 'gardener'), enableDualRole)
router.get('/administrator-check', requireAuth, requireRole('administrator'), (req, res) => {
  res.json({ status: 'ok' })
})

module.exports = router
