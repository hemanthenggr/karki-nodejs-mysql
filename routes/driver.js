const router = require('express').Router()

const { bookMyRide } = require('./../controller/driver')

router.post('/bookMyRide', bookMyRide)

module.exports = router