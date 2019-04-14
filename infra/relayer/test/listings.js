'use strict'

// const chai = require('chai')
// const expect = chai.expect
const request = require('supertest')

const helper = require('./_helper')

const MarketplaceContract = require('@origin/contracts/build/contracts/V00_Marketplace')
// const IdentityProxyContract = require('@origin/contracts/build/contracts/IdentityProxy')

const app = require('../src/app')

const IpfsHash = '0x12345678901234567890123456789012'
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

describe('Relayer', () => {
  let web3, accounts, deploy
  let Forwarder, NewUserAccount, Marketplace, defaultProvider

  before(async () => {
    ;({ web3, accounts, deploy, defaultProvider } = await helper())

    // Address that pays for new user
    const forwarder = web3.eth.accounts.create()
    Forwarder = forwarder.address

    // Transfer some funds to Forwarder
    await web3.eth.sendTransaction({
      from: accounts[0],
      to: Forwarder,
      value: web3.utils.toWei('10', 'ether')
    })

    // Create user account
    NewUserAccount = web3.eth.accounts.create()

    // Deploy marketplace
    Marketplace = await deploy({
      web3,
      abi: MarketplaceContract.abi,
      bytecode: MarketplaceContract.bytecode,
      from: accounts[0],
      args: [ZERO_ADDRESS],
      gas: 4000000
    })

    // Setup environment
    process.env.MARKETPLACE_ADDRESS = Marketplace._address
    process.env.FORWARDER_PRIVATE_KEY = forwarder.privateKey
    process.env.FORWARDER_ADDRESS = Forwarder
    process.env.WEB3_PROVIDER = defaultProvider
  })

  after(() => {})

  it('should accept signed data and create a proxy address and forward the transaction', async () => {
    const txData = Marketplace.methods
      .createListing(IpfsHash, 0, Marketplace._address)
      .encodeABI()

    const dataToSign = web3.utils.soliditySha3(
      { t: 'address', v: NewUserAccount.address }, // Signer
      { t: 'address', v: Marketplace._address }, // Marketplace address
      { t: 'uint256', v: web3.utils.toWei('0', 'ether') }, // value
      { t: 'bytes', v: txData },
      { t: 'uint256', v: 0 } // nonce
    )

    const signer = NewUserAccount.address
    const sign = web3.eth.accounts.sign(dataToSign, NewUserAccount.privateKey)

    await request(app)
      .post('/relayer/listings/')
      .send({
        sign: sign.signature,
        signer,
        txData
      })
      .expect(200)
  })
})
