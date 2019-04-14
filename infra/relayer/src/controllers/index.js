'use strict'

const express = require('express')
const router = express.Router()

router.use('/relayer/listings', require('./listings'))

module.exports = router
