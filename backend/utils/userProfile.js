const MIN_REGISTRATION_AGE = 18
const MAX_REGISTRATION_AGE = 120

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function formatDateOnly(value) {
  if (!value) return null
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    const year = value.getFullYear()
    const month = String(value.getMonth() + 1).padStart(2, '0')
    const day = String(value.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
    if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) return trimmed.slice(0, 10)
  }
  return null
}

function calculateAge(dateOfBirth, referenceDate = new Date()) {
  const formatted = formatDateOnly(dateOfBirth)
  if (!formatted) return null

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(formatted)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const check = new Date(year, month - 1, day)
  if (check.getFullYear() !== year || check.getMonth() !== month - 1 || check.getDate() !== day) {
    return null
  }

  const refYear = referenceDate.getFullYear()
  const refMonth = referenceDate.getMonth() + 1
  const refDay = referenceDate.getDate()

  let age = refYear - year
  if (refMonth < month || (refMonth === month && refDay < day)) {
    age -= 1
  }
  return age
}

function validateNameParts({ firstName, middleName, lastName }) {
  const cleanFirst = normalizeText(firstName)
  const cleanMiddle = normalizeText(middleName) || null
  const cleanLast = normalizeText(lastName)

  if (!cleanFirst || cleanFirst.length > 100 || !cleanLast || cleanLast.length > 100) {
    return { error: 'First name and last name are required and must be 100 characters or fewer.' }
  }
  if (cleanMiddle && cleanMiddle.length > 100) {
    return { error: 'Middle name must be 100 characters or fewer.' }
  }

  return { firstName: cleanFirst, middleName: cleanMiddle, lastName: cleanLast }
}

function validateMobileNumber(rawValue, { required = false } = {}) {
  const phone = normalizeText(rawValue)
  if (!phone) {
    return required ? { error: 'Mobile number is required.' } : { phone: null }
  }
  if (phone.length > 30) {
    return { error: 'Mobile number must be 30 characters or fewer.' }
  }
  if (!/^\+?[\d\s().-]+$/.test(phone)) {
    return { error: 'Mobile number contains invalid characters.' }
  }
  const digits = phone.replace(/\D/g, '')
  const isLocalMobile = /^09\d{9}$/.test(digits)
  const isInternationalMobile = /^639\d{9}$/.test(digits)
  const isPhilippineMobile = phone.startsWith('+')
    ? isInternationalMobile
    : isLocalMobile || isInternationalMobile
  if (!isPhilippineMobile) {
    return { error: 'Please enter a valid Philippine mobile number (e.g., 0917 123 4567 or +63 917 123 4567).' }
  }
  return { phone }
}

function validateDateOfBirth(rawValue, { required = false, minAge = MIN_REGISTRATION_AGE, maxAge = MAX_REGISTRATION_AGE } = {}) {
  if (rawValue === undefined || rawValue === null || normalizeText(String(rawValue)) === '') {
    return required ? { error: 'Date of birth is required.' } : { dateOfBirth: null, age: null }
  }

  const dobStr = formatDateOnly(rawValue)
  if (!dobStr) {
    return { error: 'Date of birth must be a valid date in YYYY-MM-DD format.' }
  }

  const age = calculateAge(dobStr)
  if (age === null) {
    return { error: 'Please enter a valid calendar date of birth.' }
  }
  if (age < 0) {
    return { error: 'Date of birth cannot be in the future.' }
  }
  if (age < minAge) {
    return { error: `You must be at least ${minAge} years old to use HugaTiera.` }
  }
  if (age > maxAge) {
    return { error: 'Please enter a valid date of birth.' }
  }

  return { dateOfBirth: dobStr, age }
}

function formatFullName({ firstName, middleName, lastName }) {
  return [firstName, middleName, lastName].map((part) => normalizeText(part)).filter(Boolean).join(' ')
}

function sanitizeUser(user) {
  const firstName = user.first_name ?? user.firstName ?? ''
  const middleName = user.middle_name ?? user.middleName ?? null
  const lastName = user.last_name ?? user.lastName ?? ''
  const dateOfBirth = formatDateOnly(user.date_of_birth ?? user.dateOfBirth)
  const canActAsClient = user.can_act_as_client !== undefined
    ? Boolean(user.can_act_as_client)
    : (user.canActAsClient !== undefined ? Boolean(user.canActAsClient) : user.role === 'client')
  const canActAsGardener = user.can_act_as_gardener !== undefined
    ? Boolean(user.can_act_as_gardener)
    : (user.canActAsGardener !== undefined ? Boolean(user.canActAsGardener) : user.role === 'gardener')
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    canActAsClient,
    canActAsGardener,
    isDualRole: canActAsClient && canActAsGardener,
    firstName,
    middleName,
    lastName,
    fullName: formatFullName({ firstName, middleName, lastName }),
    phone: user.phone ?? null,
    dateOfBirth,
    age: calculateAge(dateOfBirth),
  }
}

module.exports = {
  MIN_REGISTRATION_AGE,
  calculateAge,
  formatDateOnly,
  formatFullName,
  normalizeText,
  sanitizeUser,
  validateDateOfBirth,
  validateMobileNumber,
  validateNameParts,
}
