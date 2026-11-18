function getManilaDate(value) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value)
  const values = Object.fromEntries(parts.map(({ type, value: partValue }) => [type, partValue]))

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
  }
}

function validateDateOfBirth(value, now = new Date()) {
  if (typeof value !== 'string' || value.length === 0) {
    return 'Date of birth is required.'
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return 'Enter a valid date of birth.'
  }

  const [year, month, day] = value.split('-').map(Number)
  const parsedDate = new Date(Date.UTC(year, month - 1, day))
  if (parsedDate.toISOString().slice(0, 10) !== value) {
    return 'Enter a valid date of birth.'
  }

  const today = getManilaDate(now)
  const todayString = `${today.year}-${String(today.month).padStart(2, '0')}-${String(today.day).padStart(2, '0')}`
  if (value > todayString) {
    return 'Date of birth cannot be in the future.'
  }

  const age = today.year - year - (
    today.month < month || (today.month === month && today.day < day) ? 1 : 0
  )
  if (age < 18) {
    return 'You must be at least 18 years old to register.'
  }

  return null
}

module.exports = { validateDateOfBirth }
