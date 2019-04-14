'use strict'

const express = require('express')
const router = express.Router()
const { createListingProxyValidation } = require('./../utils/validation')
const { getWeb3, deployProxy, verifySign, verifyFunctionSignature, forwardTx } = require('./../utils/web3Helper')
const { CREATE_LISTING_FUNCTION_SIGNATURE } = require('./../constants')

/**
 * Create a listing on the Marketplace contract
 * using the data signed by the user
 */
router.post('/', createListingProxyValidation, async (req, res) => {
  const web3 = getWeb3()

  const { sign, signer, txData } = req.body

  const signValid = await verifySign({ web3, sign, signer, txData })
  // 1. Verify sign
  if (!signValid) {
    res.status(400)
    res.send({
      errors: ['Cannot verify your signature']
    })
    return
  }

  // 2. Verify txData and check function signature
  if (!verifyFunctionSignature({ functionSignature: CREATE_LISTING_FUNCTION_SIGNATURE, data: txData })) {
    res.status(400)
    res.send({
      errors: ['Invalid function signature']
    })
    return
  }

  // 3. Deploy or get user's proxy instance
  const IdentityProxy = await deployProxy({
    web3,
    forAddress: signer
  })

  // 4. Call the forward method
  const txHash = await forwardTx({
    web3,
    IdentityProxy,
    sign,
    signer,
    txData
  })

  // 5. Increment Nonce in DB
  // TODO

  res.status(200)
  res.send({
    userProxy: IdentityProxy._address,
    txHash
  })
})

module.exports = router