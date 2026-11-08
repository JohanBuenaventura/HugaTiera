const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { pool } = require('../config/database')

const publicRoles = new Set(['client', 'gardener'])

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function validateCredentials({ email, password }) {
  const normalizedEmail = normalizeText(email).toLowerCase()

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return 'A valid email address is required.'
  }

  if (typeof password !== 'string' || password.length < 8 || password.length > 72) {
    return 'Password must be between 8 and 72 characters.'
  }

  return null
}

function createAuthToken(user) {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured.')
  }

  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      firstName: user.first_name,
      lastName: user.last_name,
      phone: user.phone,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '1d' },
  )
}

function setAuthCookie(res, token) {
  res.cookie('auth_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000,
    path: '/',
  })
}

function sanitizeUser(user) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    firstName: user.first_name,
    lastName: user.last_name,
    phone: user.phone,
  }
}

async function register(req, res, next) {
  const firstName = normalizeText(req.body.firstName)
  const lastName = normalizeText(req.body.lastName)
  const phone = normalizeText(req.body.phone) || null
  const email = normalizeText(req.body.email).toLowerCase()
  const password = req.body.password
  const role = normalizeText(req.body.role).toLowerCase()
  const validationError = validateCredentials({ email, password })

  if (!firstName || firstName.length > 100 || !lastName || lastName.length > 100) {
    return res.status(400).json({ message: 'First name and last name are required.' })
  }
  if (phone && phone.length > 30) {
    return res.status(400).json({ message: 'Phone number is too long.' })
  }
  if (validationError) {
    return res.status(400).json({ message: validationError })
  }
  if (!publicRoles.has(role)) {
    return res.status(400).json({ message: 'Choose either a client or gardener account.' })
  }

  const connection = await pool.getConnection()

  try {
    await connection.beginTransaction()
    const [existingUsers] = await connection.execute('SELECT id FROM users WHERE email = ? LIMIT 1', [email])

    if (existingUsers.length > 0) {
      await connection.rollback()
      return res.status(409).json({ message: 'An account with this email already exists.' })
    }

    const passwordHash = await bcrypt.hash(password, 12)
    const [result] = await connection.execute(
      'INSERT INTO users (email, password_hash, role, first_name, last_name, phone) VALUES (?, ?, ?, ?, ?, ?)',
      [email, passwordHash, role, firstName, lastName, phone],
    )

    if (role === 'client') {
      await connection.execute('INSERT INTO client_profiles (user_id) VALUES (?)', [result.insertId])
    } else {
      await connection.execute('INSERT INTO gardener_profiles (user_id) VALUES (?)', [result.insertId])
    }

    await connection.commit()
    const user = { id: result.insertId, email, role, first_name: firstName, last_name: lastName, phone }
    setAuthCookie(res, createAuthToken(user))
    return res.status(201).json({ user: sanitizeUser(user) })
  } catch (error) {
    await connection.rollback()
    return next(error)
  } finally {
    connection.release()
  }
}

async function login(req, res, next) {
  const email = normalizeText(req.body.email).toLowerCase()
  const password = req.body.password
  const validationError = validateCredentials({ email, password })

  if (validationError) {
    return res.status(400).json({ message: validationError })
  }

  try {
    const [users] = await pool.execute(
      'SELECT id, email, password_hash, role, first_name, last_name, phone FROM users WHERE email = ? AND is_active = TRUE LIMIT 1',
      [email],
    )
    const user = users[0]
    const passwordMatches = user ? await bcrypt.compare(password, user.password_hash) : false

    if (!passwordMatches) {
      return res.status(401).json({ message: 'Invalid email or password.' })
    }

    setAuthCookie(res, createAuthToken(user))
    return res.json({ user: sanitizeUser(user) })
  } catch (error) {
    return next(error)
  }
}

function logout(req, res) {
  res.clearCookie('auth_token', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' })
  return res.status(204).send()
}

function currentUser(req, res) {
  return res.json({ user: req.user })
}

module.exports = {
  currentUser,
  login,
  logout,
  register,
}
