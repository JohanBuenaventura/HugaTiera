const assert = require('node:assert/strict')
const { test } = require('node:test')
const { validateDateOfBirth } = require('../utils/dateOfBirth')

const manilaEighteenthBirthday = new Date('2026-11-18T16:00:00.000Z')

test('accepts a user who turns 18 on the current Manila date', () => {
  assert.equal(validateDateOfBirth('2008-11-19', manilaEighteenthBirthday), null)
})

test('rejects a user who has not yet turned 18', () => {
  assert.equal(
    validateDateOfBirth('2008-11-20', manilaEighteenthBirthday),
    'You must be at least 18 years old to register.',
  )
})

test('rejects invalid calendar dates and future dates', () => {
  assert.equal(validateDateOfBirth('2008-02-30', manilaEighteenthBirthday), 'Enter a valid date of birth.')
  assert.equal(validateDateOfBirth('2027-01-01', manilaEighteenthBirthday), 'Date of birth cannot be in the future.')
})

test('requires a date of birth', () => {
  assert.equal(validateDateOfBirth(''), 'Date of birth is required.')
})
