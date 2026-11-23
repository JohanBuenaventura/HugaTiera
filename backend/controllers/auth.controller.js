const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { pool } = require('../config/database')
const { createNotification } = require('../services/notification.service')
const {
  normalizeText,
  sanitizeUser,
  validateDateOfBirth,
  validateMobileNumber,
  validateNameParts,
} = require('../utils/userProfile')

const publicRoles = new Set(['client', 'gardener', 'both', 'clerk'])

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
    return res.status(400).json({ message: 'Choose a client, gardener, dual (client & gardener), or clerk account.' })
  }

  const isDual = role === 'both'
  const activeRole = isDual ? 'client' : role
  const canActAsClient = role === 'client' || isDual
  const canActAsGardener = role === 'gardener' || isDual

  let clientDetails = null
  let gardenerDetails = null
  let assignedClerkEmail = null
  let assignedClerkNotes = null

  if (canActAsClient) {
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
  }
  if (canActAsGardener) {
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

    const rawClerkEmail = normalizeText(req.body.assignedClerkEmail).toLowerCase()
    const rawClerkNotes = normalizeText(req.body.assignedClerkNotes) || null
    if (rawClerkEmail) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawClerkEmail) || rawClerkEmail.length > 255) {
        return res.status(400).json({ message: 'Please enter a valid email address for the clerk you want to assign.' })
      }
      if (rawClerkEmail === email) {
        return res.status(400).json({ message: 'You cannot assign your own email as your clerk.' })
      }
      if (rawClerkNotes && rawClerkNotes.length > 255) {
        return res.status(400).json({ message: 'Clerk assignment note must be 255 characters or fewer.' })
      }
      assignedClerkEmail = rawClerkEmail
      assignedClerkNotes = rawClerkNotes
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
         (email, password_hash, role, can_act_as_client, can_act_as_gardener, first_name, middle_name, last_name, phone, date_of_birth)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        email,
        passwordHash,
        activeRole,
        canActAsClient ? 1 : 0,
        canActAsGardener ? 1 : 0,
        names.firstName,
        names.middleName,
        names.lastName,
        phoneResult.phone,
        dobResult.dateOfBirth,
      ],
    )

    if (canActAsClient) {
      await connection.execute(
        'INSERT INTO client_profiles (user_id, address, city, bio) VALUES (?, ?, ?, ?)',
        [result.insertId, clientDetails.address, clientDetails.city, clientDetails.bio],
      )
    }
    if (canActAsGardener) {
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

      if (assignedClerkEmail) {
        const [clerkRows] = await connection.execute(
          'SELECT id, role, is_active FROM users WHERE email = ? LIMIT 1',
          [assignedClerkEmail],
        )
        const targetClerk = clerkRows[0]
        if (!targetClerk || !targetClerk.is_active || targetClerk.role !== 'clerk') {
          await connection.rollback()
          return res.status(400).json({
            code: 'INVALID_CLERK_EMAIL',
            message: 'The assigned clerk email must belong to an active Clerk account. Ask your clerk to sign up as a Clerk first, or leave this blank and create a clerk later in Dashboard → My Clerks.',
          })
        }
        await connection.execute(
          `INSERT INTO clerk_gardener_assignments (clerk_id, gardener_id, assigned_by, notes)
           VALUES (?, ?, ?, ?)`,
          [targetClerk.id, result.insertId, result.insertId, assignedClerkNotes],
        )
        await createNotification({
          userId: targetClerk.id,
          type: 'clerk_assignment',
          title: 'Assigned to a new gardener account',
          message: `${names.firstName} ${names.lastName} assigned you as their Clerk during sign-up to help manage schedules, services, and payment verifications.`,
          entityType: 'gardener_profile',
          entityId: result.insertId,
          connection,
        })
      }
    }

    await connection.commit()
    const user = {
      id: result.insertId,
      email,
      role: activeRole,
      can_act_as_client: canActAsClient,
      can_act_as_gardener: canActAsGardener,
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
      'SELECT id, email, password_hash, role, can_act_as_client, can_act_as_gardener, first_name, middle_name, last_name, phone, date_of_birth FROM users WHERE email = ? AND is_active = TRUE LIMIT 1',
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

async function switchRole(req, res, next) {
  const targetRole = normalizeText(req.body?.targetRole ?? req.body?.role).toLowerCase()
  if (!['client', 'gardener'].includes(targetRole)) {
    return res.status(400).json({ message: 'Target mode must be client or gardener.' })
  }

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [rows] = await connection.execute(
      'SELECT id, email, role, can_act_as_client, can_act_as_gardener, first_name, middle_name, last_name, phone, date_of_birth FROM users WHERE id = ? AND is_active = TRUE LIMIT 1 FOR UPDATE',
      [req.user.id],
    )
    const user = rows[0]
    if (!user) {
      await connection.rollback()
      return res.status(404).json({ message: 'Account not found.' })
    }
    if (!['client', 'gardener'].includes(user.role)) {
      await connection.rollback()
      return res.status(403).json({
        code: 'ROLE_SWITCH_FORBIDDEN',
        message: 'Only client and gardener accounts can switch between Client Mode and Gardener Mode.',
      })
    }
    const allowed = targetRole === 'client' ? Boolean(user.can_act_as_client) : Boolean(user.can_act_as_gardener)
    if (!allowed) {
      await connection.rollback()
      return res.status(403).json({
        code: 'ROLE_NOT_ENABLED',
        message: `Your account does not have ${targetRole} mode enabled yet. Enable dual role in Profile & Settings first.`,
      })
    }

    await connection.execute('UPDATE users SET role = ? WHERE id = ?', [targetRole, req.user.id])
    if (targetRole === 'client') {
      await connection.execute('INSERT IGNORE INTO client_profiles (user_id, city) VALUES (?, "Zamboanga City")', [req.user.id])
    } else {
      await connection.execute('INSERT IGNORE INTO gardener_profiles (user_id, service_area) VALUES (?, "Zamboanga City")', [req.user.id])
    }

    await connection.commit()
    const updatedUser = { ...user, role: targetRole }
    setAuthCookie(res, createAuthToken(updatedUser))
    return res.json({ user: sanitizeUser(updatedUser) })
  } catch (error) {
    await connection.rollback().catch(() => {})
    return next(error)
  } finally {
    connection.release()
  }
}

async function enableDualRole(req, res, next) {
  if (!['client', 'gardener'].includes(req.user.role)) {
    return res.status(403).json({ message: 'Only client and gardener accounts can enable dual client/gardener mode.' })
  }

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [rows] = await connection.execute(
      'SELECT id, email, role, can_act_as_client, can_act_as_gardener, first_name, middle_name, last_name, phone, date_of_birth FROM users WHERE id = ? AND is_active = TRUE LIMIT 1 FOR UPDATE',
      [req.user.id],
    )
    const user = rows[0]
    if (!user) {
      await connection.rollback()
      return res.status(404).json({ message: 'Account not found.' })
    }

    const address = normalizeText(req.body?.address) || null
    const city = normalizeText(req.body?.city) || 'Zamboanga City'
    const businessName = normalizeText(req.body?.businessName) || null
    const serviceArea = normalizeText(req.body?.serviceArea) || 'Zamboanga City'

    await connection.execute(
      'UPDATE users SET can_act_as_client = TRUE, can_act_as_gardener = TRUE WHERE id = ?',
      [req.user.id],
    )
    await connection.execute(
      'INSERT IGNORE INTO client_profiles (user_id, address, city) VALUES (?, ?, ?)',
      [req.user.id, address, city],
    )
    await connection.execute(
      'INSERT IGNORE INTO gardener_profiles (user_id, business_name, service_area, is_approved) VALUES (?, ?, ?, FALSE)',
      [req.user.id, businessName, serviceArea],
    )

    await connection.commit()
    const updatedUser = { ...user, can_act_as_client: true, can_act_as_gardener: true }
    setAuthCookie(res, createAuthToken(updatedUser))
    return res.json({
      user: sanitizeUser(updatedUser),
      message: 'Dual role enabled! You can now switch between Client and Gardener modes anytime.',
    })
  } catch (error) {
    await connection.rollback().catch(() => {})
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
  enableDualRole,
  login,
  logout,
  register,
  switchRole,
}
