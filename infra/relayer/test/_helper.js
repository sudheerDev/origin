'use strict'

const Web3 = require('web3')
const Ganache = require('ganache-core')

const defaultProvider = 'ws://localhost:7545'

// Instantiate a web3 instance. Start a node if one is not already running.
// Copied from @origin/contracts/test-alt/_helper.js
const web3Helper = async (provider = defaultProvider) => {
  const web3 = new Web3(provider)
  const instance = await server(web3, provider)
  return { web3, server: instance }
}

// Copied from @origin/contracts/test-alt/_helper.js
const server = async (web3, provider) => {
  try {
    // Hack to prevent "connection not open on send" error when using websockets
    web3.setProvider(provider.replace(/^ws/, 'http'))
    await web3.eth.net.getId()
    web3.setProvider(provider)
    return
  } catch (e) {
    /* Ignore */
  }

  let port = '7545'
  if (String(provider).match(/:([0-9]+)$/)) {
    port = provider.match(/:([0-9]+)$/)[1]
  }
  const server = Ganache.server()
  await server.listen(port)
  return server
}

// Deploy the given contract and returns an instance
const deploy = async ({ web3, abi, bytecode, gas, from, args }) => {
  const Contract = new web3.eth.Contract(abi)
  const data = await Contract
    .deploy({
      data: bytecode,
      arguments: args
    })
    .encodeABI()

  const instance = await web3.eth
    .sendTransaction({
      data,
      from,
      gas,
      value: 0
    })

  const contract = new web3.eth.Contract(abi, instance.contractAddress)

  return contract
}

// Return necessary helper functions
const testHelper = async (provider = defaultProvider) => {
  const { web3 } = await web3Helper(provider)

  const accounts = await web3.eth.getAccounts()

  return {
    web3,
    accounts,
    deploy,
    defaultProvider
  }
}

module.exports = testHelper