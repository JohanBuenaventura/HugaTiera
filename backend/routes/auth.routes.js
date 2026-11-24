const express = require('express')
const {
  currentUser,
  enableRole,
  login,
  logout,
  register,
  switchActiveRole,
} = require('../controllers/auth.controller')
const { requireAuth, requireRole } = require('../middleware/auth.middleware')

const router = express.Router()

router.post('/register', register)
router.post('/login', login)
router.post('/logout', logout)
router.get('/me', requireAuth, currentUser)
router.post('/roles', requireAuth, enableRole)
router.patch('/active-role', requireAuth, switchActiveRole)
router.get('/administrator-check', requireAuth, requireRole('administrator'), (req, res) => {
  res.json({ status: 'ok' })
})

module.exports = router
