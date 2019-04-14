const Web3 = require('web3')
const IdentityProxyContract = require('@origin/contracts/build/contracts/IdentityProxy')
const utils = require('ethereumjs-utils')

const getWeb3 = (provider = process.env.WEB3_PROVIDER) => {
  const web3 = new Web3(provider)

  return web3
}

const deployProxy = async ({ web3, forAddress }) => {
  const { MARKETPLACE_ADDRESS, FORWARDER_PRIVATE_KEY } = process.env
  const Contract = new web3.eth.Contract(IdentityProxyContract.abi)
  const data = await Contract
    .deploy({
      data: IdentityProxyContract.bytecode,
      arguments: [forAddress, MARKETPLACE_ADDRESS]
    })
    .encodeABI()

  const account = web3.eth.accounts.privateKeyToAccount(FORWARDER_PRIVATE_KEY)

  const signedTx = await account.signTransaction({
    data,
    gas: 4000000,
    value: 0
  })

  const instance = await web3.eth.sendSignedTransaction(signedTx.rawTransaction)

  const contract = new web3.eth.Contract(IdentityProxyContract.abi, instance.contractAddress)

  return contract
}

const forwardTx = async ({ web3, IdentityProxy, sign, signer, txData }) => {
  const { FORWARDER_PRIVATE_KEY } = process.env

  const account = web3.eth.accounts.privateKeyToAccount(FORWARDER_PRIVATE_KEY)

  const data = await IdentityProxy.methods
    .forward(sign, signer, txData)
    .encodeABI()

  const signedTx = await account.signTransaction({
    to: IdentityProxy._address,
    data,
    gas: 4000000,
    value: 0
  })

  return new Promise((resolve, reject) => {
    web3.eth.sendSignedTransaction(signedTx.rawTransaction)
      .once('transactionHash', resolve)
      .catch(reject)
  })
}

const verifySign = async ({ web3, sign, signer, txData }) => {
  const { MARKETPLACE_ADDRESS } = process.env
  const nonce = 0 // Should get from database

  const signedData = web3.utils.soliditySha3(
    { t: 'address', v: signer }, // Signer
    { t: 'address', v: MARKETPLACE_ADDRESS }, // Marketplace address
    { t: 'uint256', v: web3.utils.toWei('0', 'ether') }, // value
    { t: 'bytes', v: txData },
    { t: 'uint256', v: nonce }, // nonce
  )

  try {
    const msgBuffer = utils.toBuffer(signedData)

    const prefix = Buffer.from("\x19Ethereum Signed Message:\n")
    const prefixedMsg = utils.sha3(
      Buffer.concat([prefix, Buffer.from(String(msgBuffer.length)), msgBuffer])
    )

    const r = utils.toBuffer(sign.slice(0,66))
    const s = utils.toBuffer('0x' + sign.slice(66,130))
    const v = utils.bufferToInt(utils.toBuffer('0x' + sign.slice(130,132)))
    
    const pub = utils.ecrecover(prefixedMsg, v, r, s)
    const address = '0x' + utils.pubToAddress(pub).toString('hex')

    return address.toLowerCase() === signer.toLowerCase()
  } catch (e) {
    return false
  }
}

const verifyFunctionSignature = async ({ functionSignature, data }) => {
  return data.toLowerCase().startsWith(functionSignature)
}

module.exports = {
  getWeb3,
  deployProxy,
  verifySign,
  verifyFunctionSignature,
  forwardTx
}