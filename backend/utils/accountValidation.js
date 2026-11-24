function validateMobileNumber(value) {
  const phone = typeof value === 'string' ? value.trim() : ''
  if (!phone) {
    return 'A mobile phone number is required.'
  }
  if (phone.length > 30 || !/^\+?[0-9\s().-]+$/.test(phone)) {
    return 'Enter a valid mobile phone number.'
  }

  const digitCount = phone.replace(/\D/g, '').length
  if (digitCount < 7 || digitCount > 15) {
    return 'Enter a mobile phone number with 7 to 15 digits.'
  }
  return null
}

function validateDateOfBirth(value, now = new Date()) {
  const dateOfBirth = typeof value === 'string' ? value.trim() : ''
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth)
  if (!match) {
    return { error: 'A valid date of birth is required.' }
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (year < 1000 || month < 1 || month > 12 || day < 1 || day > 31) {
    return { error: 'Enter a valid date of birth.' }
  }

  const parsedDate = new Date(year, month - 1, day)
  if (
    parsedDate.getFullYear() !== year
    || parsedDate.getMonth() !== month - 1
    || parsedDate.getDate() !== day
  ) {
    return { error: 'Enter a valid date of birth.' }
  }

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (parsedDate > today) {
    return { error: 'Date of birth cannot be in the future.' }
  }

  const eighteenthBirthdayYear = today.getFullYear() - 18
  const hasReachedEighteen = year < eighteenthBirthdayYear
    || (
      year === eighteenthBirthdayYear
      && (
        month < today.getMonth() + 1
        || (month === today.getMonth() + 1 && day <= today.getDate())
      )
    )
  if (!hasReachedEighteen) {
    return { error: 'You must be at least 18 years old to create an account.' }
  }

  return { value: dateOfBirth }
}

module.exports = {
  validateDateOfBirth,
  validateMobileNumber,
}
