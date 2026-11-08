const jwt = require('jsonwebtoken')

function getTokenFromRequest(req) {
  return req.cookies?.auth_token
}

function requireAuth(req, res, next) {
  const token = getTokenFromRequest(req)

  if (!token) {
    return res.status(401).json({ message: 'Authentication is required.' })
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET)
    return next()
  } catch (error) {
    return res.status(401).json({ message: 'Your session is invalid or has expired.' })
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
