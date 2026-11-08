const express = require('express')
const { checkDatabaseConnection } = require('../config/database')

const router = express.Router()

router.get('/', async (req, res, next) => {
  try {
    await checkDatabaseConnection()
    res.json({
      status: 'ok',
      database: 'connected',
    })
  } catch (error) {
    next(error)
  }
})

module.exports = router
