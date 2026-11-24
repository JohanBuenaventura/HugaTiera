const express = require('express')
const {
  changePassword,
  currentUser,
  forgotPassword,
  login,
  logout,
  register,
  resetPassword,
} = require('../controllers/auth.controller')
const { requireAuth, requireRole } = require('../middleware/auth.middleware')

const router = express.Router()

router.post('/register', register)
router.post('/login', login)
router.post('/forgot-password', forgotPassword)
router.post('/reset-password', resetPassword)
router.post('/change-password', requireAuth, changePassword)
router.post('/logout', logout)
router.get('/me', requireAuth, currentUser)
router.get('/administrator-check', requireAuth, requireRole('administrator'), (req, res) => {
  res.json({ status: 'ok' })
})

module.exports = router
