const express = require('express')
const {
  checkGardenerAvailability,
  getGardener,
  getGardenerAvailability,
} = require('../controllers/service.controller')

const router = express.Router()

router.get('/:gardenerId/availability', getGardenerAvailability)
router.post('/:gardenerId/availability/check', checkGardenerAvailability)
router.get('/:gardenerId', getGardener)

module.exports = router
