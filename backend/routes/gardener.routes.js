const express = require('express')
const { getGardener } = require('../controllers/service.controller')

const router = express.Router()

router.get('/:gardenerId', getGardener)

module.exports = router
