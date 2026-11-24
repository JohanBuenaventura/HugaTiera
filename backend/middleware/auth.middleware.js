const jwt = require('jsonwebtoken')
const { pool } = require('../config/database')
const { sanitizeUser } = require('../utils/userProfile')

function getTokenFromRequest(req) {
  return req.cookies?.auth_token
}

async function requireAuth(req, res, next) {
  const token = getTokenFromRequest(req)

  if (!token) {
    return res.status(401).json({ message: 'Authentication is required.' })
  }

  if (!process.env.JWT_SECRET) {
    return next(new Error('JWT_SECRET is not configured.'))
  }

  let payload
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET)
  } catch (error) {
    return res.status(401).json({ message: 'Your session is invalid or has expired.' })
  }

  try {
    const [users] = await pool.execute(
      'SELECT id, email, role, can_act_as_client, can_act_as_gardener, first_name, middle_name, last_name, phone, date_of_birth, is_active FROM users WHERE id = ? LIMIT 1',
      [payload.id],
    )
    const user = users[0]
    if (!user || !user.is_active) {
      res.clearCookie('auth_token', {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
      })
      return res.status(401).json({ message: 'Your account is inactive or no longer available.' })
    }

    req.user = sanitizeUser(user)
    return next()
  } catch (error) {
    return next(error)
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'You do not have permission to access this resource.' })
    }

    return next()
  }
}

module.exports = {
  requireAuth,
  requireRole,
}
