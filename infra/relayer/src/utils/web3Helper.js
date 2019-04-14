const Web3 = require('web3')
const IdentityProxyContract = require('@origin/contracts/build/contracts/IdentityProxy')

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

const verifySign = () => {}

module.exports = {
  getWeb3,
  deployProxy,
  verifySign,
  forwardTx
}