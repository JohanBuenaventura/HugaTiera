const assert = require('node:assert/strict')
const { describe, test } = require('node:test')
const { validateDateOfBirth, validateMobileNumber } = require('../utils/accountValidation')

describe('registration account validation', () => {
  test('accepts a user who turns 18 today and rejects one who turns 18 tomorrow', () => {
    const today = new Date(2026, 3, 15)
    assert.deepEqual(validateDateOfBirth('2008-04-15', today), { value: '2008-04-15' })
    assert.match(validateDateOfBirth('2008-04-16', today).error, /at least 18/i)
  })

  test('rejects invalid calendar dates, future dates, and malformed date strings', () => {
    const today = new Date(2026, 3, 15)
    assert.match(validateDateOfBirth('2000-02-30', today).error, /valid date/i)
    assert.match(validateDateOfBirth('2026-04-16', today).error, /future/i)
    assert.match(validateDateOfBirth('04/15/2000', today).error, /valid date/i)
  })

  test('accepts formatted mobile numbers but requires 7 to 15 digits', () => {
    assert.equal(validateMobileNumber('+63 (917) 123-4567'), null)
    assert.match(validateMobileNumber('12345'), /7 to 15 digits/i)
    assert.match(validateMobileNumber('phone-number'), /valid mobile/i)
    assert.match(validateMobileNumber(''), /required/i)
  })
})
