'use strict'

const { check, validationResult } = require('express-validator/check')

const handleValidationError = (req, res, next) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    res.status(400).json({
      errors: [errors.array()[0].msg]
    })
  } else {
    next()
  }
}

const hexRegex = /^(0x)?[0-9a-f]+$/i

const isValidHex = (value) => {
  if (!hexRegex.test(value)) {
    throw new Error('Not valid hex')
  }
  return true
}

const createListingProxyValidation = [
  check('sign')
    .not()
    .isEmpty()
    .withMessage('Field `sign` must not be empty')
    // .ltrim('0x')
    // .isHexadecimal()
    .custom(isValidHex)
    .withMessage('Field `sign` is not a valid hexadecimal'),
  check('signer')
    .not()
    .isEmpty()
    .withMessage('Field `signer` must not be empty')
    // .ltrim('0x')
    // .isHexadecimal()
    .custom(isValidHex)
    .withMessage('Field `signer` is not a valid hexadecimal'),
  check('txData')
    .not()
    .isEmpty()
    .withMessage('Field `txData` must not be empty')
    // .ltrim('0x')
    // .isHexadecimal()
    .custom(isValidHex)
    .withMessage('Field `txData` is not a valid hexadecimal'),
  handleValidationError
]

module.exports.createListingProxyValidation = createListingProxyValidation