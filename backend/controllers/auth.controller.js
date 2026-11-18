const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { pool } = require('../config/database')
const { validateDateOfBirth, validateMobileNumber } = require('../utils/accountValidation')

const publicRoles = new Set(['client', 'gardener'])
const roleOrder = ['client', 'gardener', 'administrator']

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function validateCredentials({ email, password }) {
  const normalizedEmail = normalizeText(email).toLowerCase()

  if (normalizedEmail.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
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
      middleName: user.middle_name || '',
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
    roles: user.roles || [user.role],
    firstName: user.first_name,
    middleName: user.middle_name || '',
    lastName: user.last_name,
    phone: user.phone,
  }
}

async function getUserRoles(connection, userId) {
  const [rows] = await connection.execute(
    'SELECT role FROM user_roles WHERE user_id = ?',
    [userId],
  )
  return rows.map((row) => row.role).sort((a, b) => roleOrder.indexOf(a) - roleOrder.indexOf(b))
}

async function register(req, res, next) {
  const firstName = normalizeText(req.body.firstName)
  const middleName = normalizeText(req.body.middleName)
  const lastName = normalizeText(req.body.lastName)
  const phone = normalizeText(req.body.phone)
  const dateOfBirth = normalizeText(req.body.dateOfBirth)
  const address = normalizeText(req.body.address)
  const city = normalizeText(req.body.city)
  const email = normalizeText(req.body.email).toLowerCase()
  const password = req.body.password
  const role = normalizeText(req.body.role).toLowerCase()
  const validationError = validateCredentials({ email, password })

  if (!publicRoles.has(role)) {
    return res.status(400).json({ message: 'Choose either a client or gardener account.' })
  }
  if (!firstName || firstName.length > 100 || !lastName || lastName.length > 100) {
    return res.status(400).json({ message: 'First name and last name are required.' })
  }
  if (middleName.length > 100) {
    return res.status(400).json({ message: 'Middle name must be 100 characters or fewer.' })
  }
  if (validationError) {
    return res.status(400).json({ message: validationError })
  }
  const phoneError = validateMobileNumber(phone)
  if (phoneError) {
    return res.status(400).json({ message: phoneError })
  }
  const birthDateValidation = validateDateOfBirth(dateOfBirth)
  if (birthDateValidation.error) {
    return res.status(400).json({ message: birthDateValidation.error })
  }
  if (role === 'client') {
    if (!address || address.length > 255) {
      return res.status(400).json({ message: 'A service address between 1 and 255 characters is required.' })
    }
    if (!city || city.length > 100) {
      return res.status(400).json({ message: 'A city between 1 and 100 characters is required.' })
    }
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
      `INSERT INTO users
        (email, password_hash, role, first_name, middle_name, last_name, date_of_birth, phone)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [email, passwordHash, role, firstName, middleName || null, lastName, birthDateValidation.value, phone],
    )
    await connection.execute('INSERT INTO user_roles (user_id, role) VALUES (?, ?)', [result.insertId, role])

    if (role === 'client') {
      await connection.execute(
        'INSERT INTO client_profiles (user_id, address, city) VALUES (?, ?, ?)',
        [result.insertId, address, city],
      )
    } else {
      await connection.execute('INSERT INTO gardener_profiles (user_id) VALUES (?)', [result.insertId])
    }

    await connection.commit()
    const user = {
      id: result.insertId,
      email,
      role,
      first_name: firstName,
      middle_name: middleName,
      last_name: lastName,
      phone,
      roles: [role],
    }
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
      'SELECT id, email, password_hash, role, first_name, middle_name, last_name, phone FROM users WHERE email = ? AND is_active = TRUE LIMIT 1',
      [email],
    )
    let user = users[0]
    const passwordMatches = user ? await bcrypt.compare(password, user.password_hash) : false

    if (!passwordMatches) {
      return res.status(401).json({ message: 'Invalid email or password.' })
    }

    user = { ...user, roles: await getUserRoles(pool, user.id) }
    setAuthCookie(res, createAuthToken(user))
    return res.json({ user: sanitizeUser(user) })
  } catch (error) {
    return next(error)
  }
}

async function switchActiveRole(req, res, next) {
  const role = normalizeText(req.body.role).toLowerCase()
  if (!roleOrder.includes(role)) {
    return res.status(400).json({ message: 'Choose a role assigned to your account.' })
  }
  if (!req.user.roles.includes(role)) {
    return res.status(403).json({ message: 'That role is not enabled for your account.' })
  }

  try {
    const [result] = await pool.execute(
      'UPDATE users SET role = ? WHERE id = ? AND is_active = TRUE',
      [role, req.user.id],
    )
    if (!result.affectedRows) {
      const [users] = await pool.execute('SELECT role, is_active FROM users WHERE id = ? LIMIT 1', [req.user.id])
      if (!users[0] || !users[0].is_active) {
        return res.status(401).json({ message: 'Your account is inactive or no longer available.' })
      }
      if (users[0].role !== role) {
        return res.status(409).json({ message: 'Your active role could not be changed. Please try again.' })
      }
    }
    return res.json({ user: { ...req.user, role } })
  } catch (error) {
    return next(error)
  }
}

async function enableRole(req, res, next) {
  const role = normalizeText(req.body.role).toLowerCase()
  if (!publicRoles.has(role)) {
    return res.status(400).json({ message: 'Only client and gardener roles can be enabled.' })
  }
  if (req.user.roles.includes('administrator')) {
    return res.status(403).json({ message: 'Administrator accounts cannot enable client or gardener modes.' })
  }
  if (req.user.roles.includes(role)) {
    return res.status(409).json({ message: 'This role is already enabled for your account.' })
  }

  const address = normalizeText(req.body.address)
  const city = normalizeText(req.body.city)
  if (role === 'client') {
    if (!address || address.length > 255) {
      return res.status(400).json({ message: 'A service address between 1 and 255 characters is required.' })
    }
    if (!city || city.length > 100) {
      return res.status(400).json({ message: 'A city between 1 and 100 characters is required.' })
    }
  }

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [memberships] = await connection.execute(
      'SELECT role FROM user_roles WHERE user_id = ? FOR UPDATE',
      [req.user.id],
    )
    if (memberships.some((membership) => membership.role === role)) {
      await connection.rollback()
      return res.status(409).json({ message: 'This role is already enabled for your account.' })
    }

    if (role === 'client') {
      await connection.execute(
        'INSERT INTO client_profiles (user_id, address, city) VALUES (?, ?, ?)',
        [req.user.id, address, city],
      )
    } else {
      await connection.execute('INSERT INTO gardener_profiles (user_id) VALUES (?)', [req.user.id])
    }
    await connection.execute('INSERT INTO user_roles (user_id, role) VALUES (?, ?)', [req.user.id, role])
    const [updatedUser] = await connection.execute(
      'UPDATE users SET role = ? WHERE id = ? AND is_active = TRUE',
      [role, req.user.id],
    )
    if (!updatedUser.affectedRows) {
      await connection.rollback()
      return res.status(401).json({ message: 'Your account is inactive or no longer available.' })
    }
    await connection.commit()

    const roles = [...req.user.roles, role].sort((a, b) => roleOrder.indexOf(a) - roleOrder.indexOf(b))
    return res.status(201).json({ user: { ...req.user, role, roles } })
  } catch (error) {
    await connection.rollback()
    return next(error)
  } finally {
    connection.release()
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
  enableRole,
  login,
  logout,
  register,
  switchActiveRole,
}
