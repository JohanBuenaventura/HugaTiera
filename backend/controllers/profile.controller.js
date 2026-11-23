const bcrypt = require('bcryptjs')
const { pool } = require('../config/database')
const { createNotification } = require('../services/notification.service')
const {
  avatarsDirectory,
  processAndSaveAvatar,
  removeFileIfExists,
  resolveContainedPath,
} = require('../middleware/upload.middleware')
const {
  calculateAge,
  formatDateOnly,
  formatFullName,
  normalizeText,
  validateDateOfBirth,
  validateMobileNumber,
  validateNameParts,
} = require('../utils/userProfile')
const {
  normalizeTimeOfDay,
  parseWorkingDays,
} = require('../utils/scheduling')

function text(value) {
  return normalizeText(value)
}

function validateCommonProfile(body) {
  const names = validateNameParts({
    firstName: body.firstName,
    middleName: body.middleName,
    lastName: body.lastName,
  })
  if (names.error) return { message: names.error }

  const phoneResult = validateMobileNumber(body.phone, { required: false })
  if (phoneResult.error) return { message: phoneResult.error }

  const hasMiddleName = body.middleName !== undefined
  const hasDateOfBirth = body.dateOfBirth !== undefined
  let dateOfBirth = null
  if (hasDateOfBirth) {
    const dobResult = validateDateOfBirth(body.dateOfBirth, { required: false })
    if (dobResult.error) return { message: dobResult.error }
    dateOfBirth = dobResult.dateOfBirth
  }

  return {
    firstName: names.firstName,
    middleName: names.middleName,
    hasMiddleName,
    lastName: names.lastName,
    phone: phoneResult.phone,
    hasDateOfBirth,
    dateOfBirth,
  }
}

async function getProfile(req, res, next) {
  try {
    const [users] = await pool.execute(
      'SELECT id, email, role, can_act_as_client, can_act_as_gardener, first_name, middle_name, last_name, phone, date_of_birth, avatar_path, created_at FROM users WHERE id = ? AND is_active = TRUE LIMIT 1',
      [req.user.id],
    )
    const user = users[0]

    if (!user) return res.status(404).json({ message: 'Profile was not found.' })

    let profile = null
    let counts = {}
    if (user.role === 'client') {
      const [profiles] = await pool.execute('SELECT address, city, bio FROM client_profiles WHERE user_id = ?', [user.id])
      profile = profiles[0] || null
      const [result] = await pool.execute(`
        SELECT
          (SELECT COUNT(*) FROM inquiries WHERE client_id = ?) AS inquiries,
          (SELECT COUNT(*) FROM bookings WHERE client_id = ?) AS bookings,
          (SELECT COUNT(*) FROM notifications WHERE user_id = ?) AS notifications
      `, [user.id, user.id, user.id])
      counts = result[0]
    } else if (user.role === 'gardener') {
      const [profiles] = await pool.execute(
        `SELECT business_name, description, service_area, years_of_experience,
                working_days, work_start_time, work_end_time, max_concurrent_jobs, crew_size, availability_notes,
                is_approved
         FROM gardener_profiles WHERE user_id = ?`,
        [user.id],
      )
      const [unavailRows] = await pool.execute(
        `SELECT id, start_date, end_date, reason, created_at
         FROM gardener_unavailable_dates
         WHERE gardener_id = ?
         ORDER BY start_date ASC, id ASC`,
        [user.id],
      )
      profile = profiles[0]
        ? {
          ...profiles[0],
          work_start_time: String(profiles[0].work_start_time || '08:00:00').slice(0, 5),
          work_end_time: String(profiles[0].work_end_time || '17:00:00').slice(0, 5),
          unavailable_dates: unavailRows.map((row) => ({
            id: row.id,
            start_date: formatDateOnly(row.start_date),
            end_date: formatDateOnly(row.end_date),
            reason: row.reason || null,
            created_at: row.created_at,
          })),
        }
        : null
      const [result] = await pool.execute(`
        SELECT
          (SELECT COUNT(*) FROM services WHERE gardener_id = ? AND is_active = TRUE) AS services,
          (SELECT COUNT(*) FROM inquiries i
           WHERE i.gardener_id = ?
              OR EXISTS (SELECT 1 FROM quotations q WHERE q.inquiry_id = i.id AND q.gardener_id = ?)) AS inquiries,
          (SELECT COUNT(*) FROM bookings WHERE gardener_id = ?) AS bookings
      `, [user.id, user.id, user.id, user.id])
      counts = result[0]
    }

    const dateOfBirth = formatDateOnly(user.date_of_birth)
    return res.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        canActAsClient: Boolean(user.can_act_as_client || user.role === 'client'),
        canActAsGardener: Boolean(user.can_act_as_gardener || user.role === 'gardener'),
        isDualRole: Boolean(user.can_act_as_client && user.can_act_as_gardener),
        firstName: user.first_name,
        middleName: user.middle_name || null,
        lastName: user.last_name,
        fullName: formatFullName({
          firstName: user.first_name,
          middleName: user.middle_name,
          lastName: user.last_name,
        }),
        phone: user.phone,
        dateOfBirth,
        age: calculateAge(dateOfBirth),
        avatarPath: user.avatar_path,
        createdAt: user.created_at,
      },
      profile,
      counts,
    })
  } catch (error) {
    return next(error)
  }
}

async function updateProfile(req, res, next) {
  const common = validateCommonProfile(req.body)
  if (common.message) return res.status(400).json(common)

  const connection = await pool.getConnection()

  try {
    await connection.beginTransaction()
    const [existingRows] = await connection.execute(
      'SELECT middle_name, date_of_birth FROM users WHERE id = ? AND is_active = TRUE LIMIT 1',
      [req.user.id],
    )
    const current = existingRows[0]
    if (!current) {
      await connection.rollback()
      return res.status(404).json({ message: 'Profile was not found.' })
    }

    const nextMiddleName = common.hasMiddleName ? common.middleName : current.middle_name
    const nextDateOfBirth = common.hasDateOfBirth ? common.dateOfBirth : formatDateOnly(current.date_of_birth)

    await connection.execute(
      'UPDATE users SET first_name = ?, middle_name = ?, last_name = ?, phone = ?, date_of_birth = ? WHERE id = ? AND is_active = TRUE',
      [common.firstName, nextMiddleName, common.lastName, common.phone, nextDateOfBirth, req.user.id],
    )

    if (req.user.role === 'client') {
      const address = text(req.body.address) || null
      const city = text(req.body.city) || 'Zamboanga City'
      const bio = text(req.body.bio) || null
      if (address && address.length > 255) {
        await connection.rollback()
        return res.status(400).json({ message: 'Address is too long.' })
      }
      if (city.length > 100) {
        await connection.rollback()
        return res.status(400).json({ message: 'City is too long.' })
      }
      await connection.execute(
        'UPDATE client_profiles SET address = ?, city = ?, bio = ? WHERE user_id = ?',
        [address, city, bio, req.user.id],
      )
    } else if (req.user.role === 'gardener') {
      const businessName = text(req.body.businessName) || null
      const description = text(req.body.description) || null
      const serviceArea = text(req.body.serviceArea) || 'Zamboanga City'
      const years = req.body.yearsOfExperience === '' || req.body.yearsOfExperience === null || req.body.yearsOfExperience === undefined
        ? null
        : Number(req.body.yearsOfExperience)
      if (businessName && businessName.length > 150) {
        await connection.rollback()
        return res.status(400).json({ message: 'Business name is too long.' })
      }
      if (serviceArea.length > 150) {
        await connection.rollback()
        return res.status(400).json({ message: 'Service area is too long.' })
      }
      if (years !== null && (!Number.isInteger(years) || years < 0 || years > 100)) {
        await connection.rollback()
        return res.status(400).json({ message: 'Years of experience must be between 0 and 100.' })
      }

      const [existingGp] = await connection.execute(
        'SELECT working_days, work_start_time, work_end_time, max_concurrent_jobs, crew_size, availability_notes FROM gardener_profiles WHERE user_id = ? LIMIT 1',
        [req.user.id],
      )
      const currentGp = existingGp[0] || {}

      let nextWorkingDays = currentGp.working_days || 'mon,tue,wed,thu,fri,sat,sun'
      if (req.body.workingDays !== undefined || req.body.working_days !== undefined) {
        const parsedDays = parseWorkingDays(req.body.workingDays ?? req.body.working_days)
        if (parsedDays.error) {
          await connection.rollback()
          return res.status(400).json({ message: parsedDays.error })
        }
        nextWorkingDays = parsedDays.serialized
      }

      const rawStart = req.body.workStartTime ?? req.body.work_start_time
      const rawEnd = req.body.workEndTime ?? req.body.work_end_time
      const startTimeObj = rawStart !== undefined
        ? normalizeTimeOfDay(rawStart)
        : normalizeTimeOfDay(currentGp.work_start_time, '08:00:00')
      const endTimeObj = rawEnd !== undefined
        ? normalizeTimeOfDay(rawEnd)
        : normalizeTimeOfDay(currentGp.work_end_time, '17:00:00')

      if (startTimeObj.error || endTimeObj.error) {
        await connection.rollback()
        return res.status(400).json({ message: startTimeObj.error || endTimeObj.error })
      }
      if (endTimeObj.minutes <= startTimeObj.minutes) {
        await connection.rollback()
        return res.status(400).json({ message: 'Daily work end time must be after work start time.' })
      }

      let nextMaxConcurrent = Number(currentGp.max_concurrent_jobs) || 1
      const rawMaxConcurrent = req.body.maxConcurrentJobs ?? req.body.max_concurrent_jobs
      if (rawMaxConcurrent !== undefined && rawMaxConcurrent !== '') {
        const parsedMax = Number(rawMaxConcurrent)
        if (!Number.isInteger(parsedMax) || parsedMax < 1 || parsedMax > 10) {
          await connection.rollback()
          return res.status(400).json({ message: 'Maximum simultaneous jobs must be a whole number between 1 and 10.' })
        }
        nextMaxConcurrent = parsedMax
      }

      let nextCrewSize = Math.max(Number(currentGp.crew_size) || 1, nextMaxConcurrent)
      const rawCrewSize = req.body.crewSize ?? req.body.crew_size
      if (rawCrewSize !== undefined && rawCrewSize !== '') {
        const parsedCrew = Number(rawCrewSize)
        if (!Number.isInteger(parsedCrew) || parsedCrew < 1 || parsedCrew > 50) {
          await connection.rollback()
          return res.status(400).json({ message: 'Daily crew / worker count must be a whole number between 1 and 50.' })
        }
        nextCrewSize = Math.max(parsedCrew, nextMaxConcurrent)
      }

      const hasAvailNotes = req.body.availabilityNotes !== undefined || req.body.availability_notes !== undefined
      const nextAvailabilityNotes = hasAvailNotes
        ? (text(req.body.availabilityNotes ?? req.body.availability_notes) || null)
        : (currentGp.availability_notes || null)
      if (nextAvailabilityNotes && nextAvailabilityNotes.length > 255) {
        await connection.rollback()
        return res.status(400).json({ message: 'Availability notes must be 255 characters or fewer.' })
      }

      await connection.execute(
        `UPDATE gardener_profiles
         SET business_name = ?, description = ?, service_area = ?, years_of_experience = ?,
             working_days = ?, work_start_time = ?, work_end_time = ?, max_concurrent_jobs = ?, crew_size = ?, availability_notes = ?
         WHERE user_id = ?`,
        [
          businessName,
          description,
          serviceArea,
          years,
          nextWorkingDays,
          startTimeObj.sqlTime,
          endTimeObj.sqlTime,
          nextMaxConcurrent,
          nextCrewSize,
          nextAvailabilityNotes,
          req.user.id,
        ],
      )
    }

    await connection.commit()
    return getProfile(req, res, next)
  } catch (error) {
    await connection.rollback()
    return next(error)
  } finally {
    connection.release()
  }
}

async function createReport(req, res, next) {
  const reason = text(req.body.reason)
  const details = text(req.body.details) || null
  const reportedUserId = req.body.reportedUserId ? Number(req.body.reportedUserId) : null
  const reportedServiceId = req.body.reportedServiceId ? Number(req.body.reportedServiceId) : null
  const reportedMessageId = req.body.reportedMessageId ? Number(req.body.reportedMessageId) : null

  if (!reason || reason.length > 255) {
    return res.status(400).json({ message: 'A report reason between 1 and 255 characters is required.' })
  }
  if (details && details.length > 2000) {
    return res.status(400).json({ message: 'Report details must be 2,000 characters or fewer.' })
  }

  const hasValidTarget = [reportedUserId, reportedServiceId, reportedMessageId].some(
    (targetId) => Number.isInteger(targetId) && targetId > 0,
  )
  if (!hasValidTarget) {
    return res.status(400).json({ message: 'A valid user, service, or message target is required to submit a report.' })
  }
  if (reportedUserId === req.user.id) {
    return res.status(400).json({ message: 'You cannot submit a report against your own account.' })
  }

  try {
    if (reportedUserId) {
      const [users] = await pool.execute('SELECT id FROM users WHERE id = ? LIMIT 1', [reportedUserId])
      if (!users[0]) return res.status(404).json({ message: 'Reported user was not found.' })
    }
    if (reportedServiceId) {
      const [services] = await pool.execute('SELECT id, gardener_id FROM services WHERE id = ? LIMIT 1', [reportedServiceId])
      if (!services[0]) return res.status(404).json({ message: 'Reported service was not found.' })
      if (services[0].gardener_id === req.user.id) {
        return res.status(400).json({ message: 'You cannot report your own service listing.' })
      }
    }
    if (reportedMessageId) {
      const [messages] = await pool.execute('SELECT id, sender_id FROM messages WHERE id = ? LIMIT 1', [reportedMessageId])
      if (!messages[0]) return res.status(404).json({ message: 'Reported message was not found.' })
      if (messages[0].sender_id === req.user.id) {
        return res.status(400).json({ message: 'You cannot report your own message.' })
      }
    }

    const [result] = await pool.execute(
      `INSERT INTO reports
        (reporter_id, reported_user_id, reported_service_id, reported_message_id, reason, details)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        req.user.id,
        reportedUserId || null,
        reportedServiceId || null,
        reportedMessageId || null,
        reason,
        details,
      ],
    )
    return res.status(201).json({ id: result.insertId, status: 'open' })
  } catch (error) {
    return next(error)
  }
}

async function uploadAvatar(req, res, next) {
  if (!req.file || !req.file.buffer) {
    return res.status(400).json({ message: 'A profile picture file is required.' })
  }

  let saved = null
  try {
    const [rows] = await pool.execute('SELECT avatar_path FROM users WHERE id = ? AND is_active = TRUE LIMIT 1', [req.user.id])
    if (!rows.length) return res.status(404).json({ message: 'Profile was not found.' })
    const previousPath = rows[0].avatar_path

    saved = await processAndSaveAvatar(req.file.buffer, req.user.id)
    await pool.execute('UPDATE users SET avatar_path = ? WHERE id = ?', [saved.relativePath, req.user.id])
    if (previousPath && previousPath !== saved.relativePath) {
      await removeFileIfExists(avatarsDirectory, previousPath)
    }

    return res.json({
      avatarPath: saved.relativePath,
      avatarUrl: `/api/profiles/${req.user.id}/avatar`,
    })
  } catch (error) {
    if (saved) await removeFileIfExists(avatarsDirectory, saved.relativePath)
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message })
    return next(error)
  }
}

async function deleteAvatar(req, res, next) {
  try {
    const [rows] = await pool.execute('SELECT avatar_path FROM users WHERE id = ? AND is_active = TRUE LIMIT 1', [req.user.id])
    if (!rows.length) return res.status(404).json({ message: 'Profile was not found.' })
    const previousPath = rows[0].avatar_path

    await pool.execute('UPDATE users SET avatar_path = NULL WHERE id = ?', [req.user.id])
    await removeFileIfExists(avatarsDirectory, previousPath)
    return res.json({ status: 'ok', avatarPath: null })
  } catch (error) {
    return next(error)
  }
}

async function sendAvatar(req, res, next) {
  const userId = Number(req.params.userId)
  if (!Number.isInteger(userId) || userId < 1) {
    return res.status(400).json({ message: 'A valid user ID is required.' })
  }
  try {
    const [rows] = await pool.execute('SELECT avatar_path FROM users WHERE id = ? AND is_active = TRUE LIMIT 1', [userId])
    if (!rows.length || !rows[0].avatar_path) {
      return res.status(404).json({ message: 'Profile picture was not found.' })
    }
    const absolutePath = resolveContainedPath(avatarsDirectory, rows[0].avatar_path)
    res.set('Cache-Control', 'no-cache')
    return res.sendFile(absolutePath, (err) => {
      if (err && !res.headersSent) {
        return res.status(404).json({ message: 'Profile picture file was not found.' })
      }
      return undefined
    })
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message })
    return next(error)
  }
}

async function listUnavailableDates(req, res, next) {
  if (req.user.role !== 'gardener') {
    return res.status(403).json({ message: 'Only gardeners can manage unavailable dates.' })
  }
  try {
    const [rows] = await pool.execute(
      `SELECT id, start_date, end_date, reason, created_at
       FROM gardener_unavailable_dates
       WHERE gardener_id = ?
       ORDER BY start_date ASC, id ASC`,
      [req.user.id],
    )
    return res.json({
      unavailableDates: rows.map((row) => ({
        id: row.id,
        start_date: formatDateOnly(row.start_date),
        end_date: formatDateOnly(row.end_date),
        reason: row.reason || null,
        created_at: row.created_at,
      })),
    })
  } catch (error) {
    return next(error)
  }
}

async function addUnavailableDate(req, res, next) {
  if (req.user.role !== 'gardener') {
    return res.status(403).json({ message: 'Only gardeners can manage unavailable dates.' })
  }
  const startDate = formatDateOnly(req.body?.startDate ?? req.body?.start_date)
  const endDate = formatDateOnly(req.body?.endDate ?? req.body?.end_date) || startDate
  const reason = text(req.body?.reason) || null

  if (!startDate || !endDate) {
    return res.status(400).json({ message: 'Valid start and end dates (YYYY-MM-DD) are required.' })
  }
  if (endDate < startDate) {
    return res.status(400).json({ message: 'Unavailable end date cannot be earlier than the start date.' })
  }
  if (reason && reason.length > 255) {
    return res.status(400).json({ message: 'Reason must be 255 characters or fewer.' })
  }

  try {
    const [conflicts] = await pool.execute(
      `SELECT id FROM bookings
       WHERE gardener_id = ?
         AND status IN ('accepted', 'in_progress')
         AND DATE(scheduled_start) <= ?
         AND DATE(scheduled_end) >= ?
       LIMIT 1`,
      [req.user.id, endDate, startDate],
    )
    if (conflicts[0]) {
      return res.status(409).json({
        message: 'You already have a confirmed booking during these dates. Cancel or complete the booking before marking these dates unavailable.',
      })
    }

    const [result] = await pool.execute(
      'INSERT INTO gardener_unavailable_dates (gardener_id, start_date, end_date, reason) VALUES (?, ?, ?, ?)',
      [req.user.id, startDate, endDate, reason],
    )
    return res.status(201).json({
      id: result.insertId,
      unavailableDate: {
        id: result.insertId,
        start_date: startDate,
        end_date: endDate,
        reason,
      },
    })
  } catch (error) {
    return next(error)
  }
}

async function deleteUnavailableDate(req, res, next) {
  if (req.user.role !== 'gardener') {
    return res.status(403).json({ message: 'Only gardeners can manage unavailable dates.' })
  }
  const blockId = Number(req.params.blockId)
  if (!Number.isInteger(blockId) || blockId < 1) {
    return res.status(400).json({ message: 'A valid unavailable date entry ID is required.' })
  }
  try {
    const [result] = await pool.execute(
      'DELETE FROM gardener_unavailable_dates WHERE id = ? AND gardener_id = ?',
      [blockId, req.user.id],
    )
    if (!result.affectedRows) {
      return res.status(404).json({ message: 'Unavailable date entry was not found.' })
    }
    return res.status(204).send()
  } catch (error) {
    return next(error)
  }
}

async function listMyClerks(req, res, next) {
  if (req.user.role !== 'gardener') {
    return res.status(403).json({ message: 'Only gardeners can manage their assigned clerks.' })
  }
  try {
    const [clerks] = await pool.execute(
      `SELECT cga.id AS assignment_id, cga.clerk_id, cga.notes, cga.created_at AS assigned_at,
              u.email, u.first_name, u.last_name, u.phone, u.is_active,
              CONCAT(u.first_name, ' ', u.last_name) AS clerk_name
       FROM clerk_gardener_assignments cga
       JOIN users u ON u.id = cga.clerk_id
       WHERE cga.gardener_id = ?
       ORDER BY cga.created_at DESC, cga.id DESC`,
      [req.user.id],
    )
    return res.json({ clerks })
  } catch (error) {
    return next(error)
  }
}

async function createMyClerk(req, res, next) {
  if (req.user.role !== 'gardener') {
    return res.status(403).json({ message: 'Only gardeners can create a clerk for their account.' })
  }

  const email = text(req.body?.email).toLowerCase()
  const password = typeof req.body?.password === 'string' ? req.body.password : ''
  const notes = text(req.body?.notes) || null
  const names = validateNameParts({
    firstName: req.body?.firstName,
    middleName: req.body?.middleName,
    lastName: req.body?.lastName,
  })
  if (names.error) return res.status(400).json({ message: names.error })

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) {
    return res.status(400).json({ message: 'Please enter a valid email address for your clerk.' })
  }
  if (password.length < 8 || password.length > 72) {
    return res.status(400).json({ message: 'Clerk password must be between 8 and 72 characters.' })
  }
  const phoneResult = validateMobileNumber(req.body?.phone, { required: false })
  if (phoneResult.error) return res.status(400).json({ message: phoneResult.error })
  if (notes && notes.length > 255) {
    return res.status(400).json({ message: 'Notes must be 255 characters or fewer.' })
  }

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [existing] = await connection.execute('SELECT id FROM users WHERE email = ? LIMIT 1', [email])
    if (existing[0]) {
      await connection.rollback()
      return res.status(409).json({
        code: 'EMAIL_EXISTS',
        message: 'An account with this email already exists. If they are already a Clerk, use "Assign existing clerk by email" instead.',
      })
    }

    const passwordHash = await bcrypt.hash(password, 10)
    const [userIns] = await connection.execute(
      `INSERT INTO users
        (email, password_hash, role, can_act_as_client, can_act_as_gardener, first_name, middle_name, last_name, phone)
       VALUES (?, ?, 'clerk', FALSE, FALSE, ?, ?, ?, ?)`,
      [email, passwordHash, names.firstName, names.middleName, names.lastName, phoneResult.phone],
    )
    const clerkId = userIns.insertId

    const [assignIns] = await connection.execute(
      `INSERT INTO clerk_gardener_assignments (clerk_id, gardener_id, assigned_by, notes)
       VALUES (?, ?, ?, ?)`,
      [clerkId, req.user.id, req.user.id, notes],
    )

    await createNotification({
      userId: clerkId,
      type: 'clerk_assignment',
      title: 'Welcome to HugaTiera Clerk Desk',
      message: `${req.user.firstName} ${req.user.lastName} added you as their Assigned Clerk to help manage schedules, services, and payment verifications.`,
      entityType: 'gardener_profile',
      entityId: req.user.id,
      connection,
    })

    await connection.commit()
    return res.status(201).json({
      assignmentId: assignIns.insertId,
      clerk: {
        assignment_id: assignIns.insertId,
        clerk_id: clerkId,
        email,
        first_name: names.firstName,
        last_name: names.lastName,
        clerk_name: `${names.firstName} ${names.lastName}`.trim(),
        phone: phoneResult.phone,
        is_active: true,
        notes,
      },
    })
  } catch (error) {
    await connection.rollback().catch(() => {})
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'An account with this email already exists.' })
    }
    return next(error)
  } finally {
    connection.release()
  }
}

async function assignExistingClerk(req, res, next) {
  if (req.user.role !== 'gardener') {
    return res.status(403).json({ message: 'Only gardeners can assign a clerk to their account.' })
  }
  const email = text(req.body?.email).toLowerCase()
  const notes = text(req.body?.notes) || null
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: 'Please enter a valid clerk email address.' })
  }
  if (notes && notes.length > 255) {
    return res.status(400).json({ message: 'Notes must be 255 characters or fewer.' })
  }

  try {
    const [rows] = await pool.execute(
      'SELECT id, email, role, first_name, last_name, phone, is_active FROM users WHERE email = ? LIMIT 1',
      [email],
    )
    const target = rows[0]
    if (!target || !target.is_active) {
      return res.status(404).json({ message: 'No active account was found with that email.' })
    }
    if (target.role !== 'clerk') {
      return res.status(400).json({
        code: 'TARGET_NOT_CLERK',
        message: 'Only existing Clerk accounts can be linked by email. To add a new staff member, use "Create new clerk account" instead.',
      })
    }
    if (target.id === req.user.id) {
      return res.status(400).json({ message: 'You cannot assign yourself as your own clerk.' })
    }

    const [ins] = await pool.execute(
      `INSERT INTO clerk_gardener_assignments (clerk_id, gardener_id, assigned_by, notes)
       VALUES (?, ?, ?, ?)`,
      [target.id, req.user.id, req.user.id, notes],
    )

    await createNotification({
      userId: target.id,
      type: 'clerk_assignment',
      title: 'Assigned to manage a gardener',
      message: `${req.user.firstName} ${req.user.lastName} assigned you as their Clerk to help manage schedules, services, and payment verifications.`,
      entityType: 'gardener_profile',
      entityId: req.user.id,
    }).catch(() => {})

    return res.status(201).json({
      assignmentId: ins.insertId,
      clerk: {
        assignment_id: ins.insertId,
        clerk_id: target.id,
        email: target.email,
        first_name: target.first_name,
        last_name: target.last_name,
        clerk_name: `${target.first_name} ${target.last_name}`.trim(),
        phone: target.phone,
        is_active: Boolean(target.is_active),
        notes,
      },
    })
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'This clerk is already assigned to your gardener account.' })
    }
    return next(error)
  }
}

async function revokeMyClerk(req, res, next) {
  if (req.user.role !== 'gardener') {
    return res.status(403).json({ message: 'Only gardeners can revoke clerk access to their account.' })
  }
  const assignmentId = Number(req.params.assignmentId)
  if (!Number.isInteger(assignmentId) || assignmentId < 1) {
    return res.status(400).json({ message: 'A valid clerk assignment ID is required.' })
  }
  try {
    const [del] = await pool.execute(
      'DELETE FROM clerk_gardener_assignments WHERE id = ? AND gardener_id = ?',
      [assignmentId, req.user.id],
    )
    if (!del.affectedRows) {
      return res.status(404).json({ message: 'Clerk assignment was not found for your account.' })
    }
    return res.status(204).send()
  } catch (error) {
    return next(error)
  }
}

module.exports = {
  addUnavailableDate,
  assignExistingClerk,
  createMyClerk,
  createReport,
  deleteAvatar,
  deleteUnavailableDate,
  getProfile,
  listMyClerks,
  listUnavailableDates,
  revokeMyClerk,
  sendAvatar,
  updateProfile,
  uploadAvatar,
}
