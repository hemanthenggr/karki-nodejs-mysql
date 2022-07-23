const router = require('express').Router()

const driver = require('./../controller/driver')

router.get('/getdetails', driver.getDetails)

module.exports = router