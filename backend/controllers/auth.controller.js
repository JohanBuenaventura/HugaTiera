const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { pool } = require('../config/database')
const {
  normalizeText,
  sanitizeUser,
  validateDateOfBirth,
  validateMobileNumber,
  validateNameParts,
} = require('../utils/userProfile')

const publicRoles = new Set(['client', 'gardener'])

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

  const safe = sanitizeUser(user)
  return jwt.sign(
    {
      id: safe.id,
      email: safe.email,
      role: safe.role,
      firstName: safe.firstName,
      middleName: safe.middleName,
      lastName: safe.lastName,
      phone: safe.phone,
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

async function register(req, res, next) {
  const names = validateNameParts({
    firstName: req.body.firstName,
    middleName: req.body.middleName,
    lastName: req.body.lastName,
  })
  if (names.error) {
    return res.status(400).json({ message: names.error })
  }

  const dobResult = validateDateOfBirth(req.body.dateOfBirth, { required: true })
  if (dobResult.error) {
    return res.status(400).json({ message: dobResult.error })
  }

  const phoneResult = validateMobileNumber(req.body.phone, { required: true })
  if (phoneResult.error) {
    return res.status(400).json({ message: phoneResult.error })
  }

  const email = normalizeText(req.body.email).toLowerCase()
  const password = req.body.password
  const confirmPassword = req.body.confirmPassword
  const role = normalizeText(req.body.role).toLowerCase()
  const validationError = validateCredentials({ email, password })

  if (validationError) {
    return res.status(400).json({ message: validationError })
  }
  if (confirmPassword !== undefined && confirmPassword !== password) {
    return res.status(400).json({ message: 'Passwords do not match.' })
  }
  if (!publicRoles.has(role)) {
    return res.status(400).json({ message: 'Choose either a client or gardener account.' })
  }

  let clientDetails = null
  let gardenerDetails = null

  if (role === 'client') {
    const address = normalizeText(req.body.address)
    const city = req.body.city === undefined ? 'Zamboanga City' : normalizeText(req.body.city)
    const bio = normalizeText(req.body.bio) || null
    if (!address || address.length > 255) {
      return res.status(400).json({ message: 'Street or barangay address is required and must be 255 characters or fewer.' })
    }
    if (!city || city.length > 100) {
      return res.status(400).json({ message: 'City is required and must be 100 characters or fewer.' })
    }
    if (bio && bio.length > 1000) {
      return res.status(400).json({ message: 'Bio must be 1,000 characters or fewer.' })
    }
    clientDetails = { address, city, bio }
  } else {
    const businessName = normalizeText(req.body.businessName) || null
    const serviceArea = req.body.serviceArea === undefined ? 'Zamboanga City' : normalizeText(req.body.serviceArea)
    const description = normalizeText(req.body.description) || null
    const rawYears = req.body.yearsOfExperience
    const years = rawYears === undefined || rawYears === '' || rawYears === null ? null : Number(rawYears)

    if (businessName && businessName.length > 150) {
      return res.status(400).json({ message: 'Business or display name must be 150 characters or fewer.' })
    }
    if (!serviceArea || serviceArea.length > 150) {
      return res.status(400).json({ message: 'Service area is required and must be 150 characters or fewer.' })
    }
    if (years !== null && (!Number.isInteger(years) || years < 0 || years > 100)) {
      return res.status(400).json({ message: 'Years of experience must be a whole number between 0 and 100.' })
    }
    if (description && description.length > 2000) {
      return res.status(400).json({ message: 'Professional description must be 2,000 characters or fewer.' })
    }
    gardenerDetails = { businessName, serviceArea, years, description }
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
         (email, password_hash, role, first_name, middle_name, last_name, phone, date_of_birth)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        email,
        passwordHash,
        role,
        names.firstName,
        names.middleName,
        names.lastName,
        phoneResult.phone,
        dobResult.dateOfBirth,
      ],
    )

    if (role === 'client') {
      await connection.execute(
        'INSERT INTO client_profiles (user_id, address, city, bio) VALUES (?, ?, ?, ?)',
        [result.insertId, clientDetails.address, clientDetails.city, clientDetails.bio],
      )
    } else {
      await connection.execute(
        'INSERT INTO gardener_profiles (user_id, business_name, description, service_area, years_of_experience) VALUES (?, ?, ?, ?, ?)',
        [
          result.insertId,
          gardenerDetails.businessName,
          gardenerDetails.description,
          gardenerDetails.serviceArea,
          gardenerDetails.years,
        ],
      )
    }

    await connection.commit()
    const user = {
      id: result.insertId,
      email,
      role,
      first_name: names.firstName,
      middle_name: names.middleName,
      last_name: names.lastName,
      phone: phoneResult.phone,
      date_of_birth: dobResult.dateOfBirth,
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
      'SELECT id, email, password_hash, role, first_name, middle_name, last_name, phone, date_of_birth FROM users WHERE email = ? AND is_active = TRUE LIMIT 1',
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
