const assert = require('node:assert/strict')
const test = require('node:test')
const { requireRole } = require('../middleware/auth.middleware')

function runRoleCheck(user, ...roles) {
  const result = { status: null, body: null, nextCalled: false }
  const req = { user }
  const res = {
    status(status) {
      result.status = status
      return this
    },
    json(body) {
      result.body = body
      return this
    },
  }

  requireRole(...roles)(req, res, () => {
    result.nextCalled = true
  })

  return result
}

test('role authorization requires the requested role to be assigned and active', () => {
  const dualRoleUser = { id: 1, role: 'client', roles: ['client', 'gardener'] }

  assert.deepEqual(runRoleCheck(dualRoleUser, 'gardener'), {
    status: 403,
    body: { message: 'You do not have permission to access this resource.' },
    nextCalled: false,
  })
  assert.deepEqual(runRoleCheck({ ...dualRoleUser, role: 'gardener' }, 'gardener'), {
    status: null,
    body: null,
    nextCalled: true,
  })
  assert.equal(runRoleCheck({ ...dualRoleUser, roles: ['client'] }, 'gardener').status, 403)
})
