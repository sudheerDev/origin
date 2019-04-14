'use strict'

const express = require('express')
const router = express.Router()
const { createListingProxyValidation } = require('./../utils/validation')
const { getWeb3, deployProxy, verifySign, forwardTx } = require('./../utils/web3Helper')

/**
 * Create a listing on the Marketplace contract
 * using the data signed by the user
 */
router.post('/', createListingProxyValidation, async (req, res) => {
  const web3 = getWeb3()

  const { sign, signer, txData } = req.body

  // 1. Expect sign, signer address and txData

  // 2. Verify sign

  // 3. Verify txData and check function signature

  // 4. Deploy or get user's proxy instance
  const IdentityProxy = await deployProxy({
    web3,
    forAddress: signer
  })

  // 5. Call the forward method
  const txHash = await forwardTx({
    web3,
    IdentityProxy,
    sign,
    signer,
    txData
  })

  res.status(200)
  res.send({
    userProxy: IdentityProxy._address,
    txHash
  })
})

module.exports = router