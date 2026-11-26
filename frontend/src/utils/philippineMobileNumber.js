const PHILIPPINE_MOBILE_NUMBER_ERROR = 'Please enter a valid Philippine mobile number (e.g., 0917 123 4567 or +63 917 123 4567).'

export function validatePhilippineMobileNumber(value, { required = false } = {}) {
  const phone = String(value ?? '').trim()
  if (!phone) {
    return required ? 'Mobile number is required.' : ''
  }
  if (phone.length > 30) {
    return 'Mobile number must be 30 characters or fewer.'
  }
  if (!/^\+?[\d\s().-]+$/.test(phone)) {
    return 'Mobile number contains invalid characters.'
  }

  const digits = phone.replace(/\D/g, '')
  const isLocalMobile = /^09\d{9}$/.test(digits)
  const isInternationalMobile = /^639\d{9}$/.test(digits)
  const isPhilippineMobile = phone.startsWith('+')
    ? isInternationalMobile
    : isLocalMobile || isInternationalMobile

  return isPhilippineMobile ? '' : PHILIPPINE_MOBILE_NUMBER_ERROR
}

export function isValidPhilippineMobileNumber(value) {
  return validatePhilippineMobileNumber(value, { required: true }) === ''
}
