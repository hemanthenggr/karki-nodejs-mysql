const router = require('express').Router()

const driver = require('./driver')

router.use('/driver', driver)

module.exports = router