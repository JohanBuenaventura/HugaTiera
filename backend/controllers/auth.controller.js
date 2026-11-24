const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const crypto = require('crypto')
const nodemailer = require('nodemailer')
const { pool } = require('../config/database')
const { validateDateOfBirth } = require('../utils/dateOfBirth')

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
      middleName: user.middle_name,
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
    middleName: user.middle_name,
    lastName: user.last_name,
    phone: user.phone,
  }
}

function hashResetToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function getPasswordResetTtlMinutes() {
  const parsed = Number(process.env.PASSWORD_RESET_TTL_MINUTES || 30)
  return Number.isInteger(parsed) && parsed >= 5 && parsed <= 180 ? parsed : 30
}

async function sendPasswordResetEmail(email, resetUrl) {
  if (!process.env.SMTP_HOST) {
    if (process.env.NODE_ENV !== 'production') {
      console.info('[development] Password reset URL:', resetUrl)
    }
    return
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    } : undefined,
  })

  await transporter.sendMail({
    from: process.env.SMTP_FROM || 'HugaTiera <no-reply@hugatiera.local>',
    to: email,
    subject: 'Reset your HugaTiera password',
    text: `Use this link within ${getPasswordResetTtlMinutes()} minutes to reset your password:\n\n${resetUrl}\n\nIf you did not request this, ignore this email.`,
    html: `<p>Use this link within ${getPasswordResetTtlMinutes()} minutes to reset your password:</p><p><a href="${resetUrl}">Reset password</a></p><p>If you did not request this, ignore this email.</p>`,
  })
}

async function forgotPassword(req, res, next) {
  const email = normalizeText(req.body.email).toLowerCase()

  if (!/^[^\s@]+@[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: 'A valid email address is required.' })
  }

  try {
    const [users] = await pool.execute(
      'SELECT id, email, is_active FROM users WHERE email = ? LIMIT 1',
      [email],
    )
    const user = users[0]

    if (user && user.is_active) {
      const token = crypto.randomBytes(32).toString('hex')
      const tokenHash = hashResetToken(token)
      const ttlMinutes = getPasswordResetTtlMinutes()
      const connection = await pool.getConnection()

      try {
        await connection.beginTransaction()
        await connection.execute(
          'UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL',
          [user.id],
        )
        await connection.execute(
          `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
           VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ${ttlMinutes} MINUTE))`,
          [user.id, tokenHash],
        )
        await connection.commit()
      } catch (error) {
        await connection.rollback()
        throw error
      } finally {
        connection.release()
      }

      const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '')
      await sendPasswordResetEmail(user.email, `${frontendUrl}/reset-password?token=${encodeURIComponent(token)}`)
    }

    return res.json({ message: 'If an active account exists for that email, a password reset link has been sent.' })
  } catch (error) {
    return next(error)
  }
}

async function resetPassword(req, res, next) {
  const token = normalizeText(req.body.token)
  const password = req.body.password

  if (!/^[a-f0-9]{64}$/i.test(token)) {
    return res.status(400).json({ message: 'The password reset link is invalid or has expired.' })
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 72) {
    return res.status(400).json({ message: 'Password must be between 8 and 72 characters.' })
  }

  const tokenHash = hashResetToken(token)
  const connection = await pool.getConnection()

  try {
    await connection.beginTransaction()
    const [rows] = await connection.execute(
      `SELECT rt.id, rt.user_id
       FROM password_reset_tokens rt
       INNER JOIN users u ON u.id = rt.user_id
       WHERE rt.token_hash = ? AND rt.used_at IS NULL
         AND rt.expires_at > NOW() AND u.is_active = TRUE
       LIMIT 1
       FOR UPDATE`,
      [tokenHash],
    )

    if (rows.length === 0) {
      await connection.rollback()
      return res.status(400).json({ message: 'The password reset link is invalid or has expired.' })
    }

    const passwordHash = await bcrypt.hash(password, 12)
    await connection.execute(
      'UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [passwordHash, rows[0].user_id],
    )
    await connection.execute(
      'UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL',
      [rows[0].user_id],
    )
    await connection.commit()
    return res.json({ message: 'Your password has been reset. You can now sign in.' })
  } catch (error) {
    await connection.rollback()
    return next(error)
  } finally {
    connection.release()
  }
}

async function register(req, res, next) {
  const firstName = normalizeText(req.body.firstName)
  const middleName = normalizeText(req.body.middleName) || null
  const lastName = normalizeText(req.body.lastName)
  const dateOfBirth = normalizeText(req.body.dateOfBirth)
  const phone = normalizeText(req.body.phone) || null
  const address = normalizeText(req.body.address) || null
  const email = normalizeText(req.body.email).toLowerCase()
  const password = req.body.password
  const role = normalizeText(req.body.role).toLowerCase()
  const validationError = validateCredentials({ email, password })

  if (!firstName || firstName.length > 100 || !lastName || lastName.length > 100) {
    return res.status(400).json({ message: 'First name and last name are required.' })
  }
  if (middleName && middleName.length > 100) {
    return res.status(400).json({ message: 'Middle name must be 100 characters or fewer.' })
  }
  const dateOfBirthError = validateDateOfBirth(dateOfBirth)
  if (dateOfBirthError) {
    return res.status(400).json({ message: dateOfBirthError })
  }
  if (phone && phone.length > 30) {
    return res.status(400).json({ message: 'Phone number is too long.' })
  }
  if (!publicRoles.has(role)) {
    return res.status(400).json({ message: 'Choose either a client or gardener account.' })
  }
  if (role === 'client' && !address) {
    return res.status(400).json({ message: 'Address is required for client accounts.' })
  }
  if (address && address.length > 255) {
    return res.status(400).json({ message: 'Address must be 255 characters or fewer.' })
  }
  if (validationError) {
    return res.status(400).json({ message: validationError })
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
      'INSERT INTO users (email, password_hash, role, first_name, middle_name, last_name, date_of_birth, phone) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [email, passwordHash, role, firstName, middleName, lastName, dateOfBirth, phone],
    )

    if (role === 'client') {
      await connection.execute('INSERT INTO client_profiles (user_id, address) VALUES (?, ?)', [result.insertId, address])
    } else {
      await connection.execute('INSERT INTO gardener_profiles (user_id) VALUES (?)', [result.insertId])
    }

    await connection.commit()
    const user = { id: result.insertId, email, role, first_name: firstName, middle_name: middleName, last_name: lastName, phone }
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
  forgotPassword,
  login,
  logout,
  register,
  resetPassword,
}
