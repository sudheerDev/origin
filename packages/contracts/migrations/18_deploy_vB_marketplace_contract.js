const OriginToken = artifacts.require('./token/OriginToken.sol')
const VB_Marketplace = artifacts.require('./VB_Marketplace.sol')

module.exports = function(deployer, network) {
  return deployer.then(() => {
    return deployContracts(deployer, network)
  })
}

async function deployContracts(deployer, network) {
  const token = await OriginToken.deployed()
  const tokenOwner = await token.owner()
  const netId = OriginToken.network_id

  await deployer.deploy(VB_Marketplace, token.address, netId)
  const contractOwner = await token.owner()
  if (!(network === 'mainnet' || process.env['SIMULATE_MAINNET'])) {
    await token.addCallSpenderWhitelist(VB_Marketplace.address, {from:contractOwner})
  }
  
  const marketplace = await VB_Marketplace.deployed()
  const from = await marketplace.owner()

  // These need to remain synced with the dockerfiles in origin-box.
  const affiliates = {
    rinkeby: '0xc1a33cda27c68e47e370ff31cdad7d6522ea93d5',
    origin: '0xc1a33cda27c68e47e370ff31cdad7d6522ea93d5',
    development: '0x821aea9a577a9b44299b9c15c88cf3087f3b5544',
    mainnet: '0x7aD0fa0E2380a5e0208B25AC69216Bd7Ff206bF8'
  }

  if (process.env['SIMULATE_MAINNET']) {
    console.log('simulating mainnet')
    network = 'mainnet'
  }
  const affiliate = affiliates[network]
  if (affiliate) {
    console.log(`whitelisting affiliate ${affiliate}`)
    await marketplace.addAffiliate(
      affiliate,
      '0x0000000000000000000000000000000000000000000000000000000000000000',
      { from }
    )
  } else {
    console.log(`WARNING: no affiliate whitelisted for network ${network}`)
  }
  
  await token.addAllowedTransactor(marketplace.address, { from: tokenOwner })
  console.log(`Added marketplace ${marketplace.address} to whitelist`)
  if (network === 'mainnet' || process.env['SIMULATE_MAINNET']) {
    const accounts = await new Promise((resolve, reject) => {
      web3.eth.getAccounts((error, result) => {
        if (error) {
          reject(error)
        }
        resolve(result)
      })
    })
    const owner = accounts[0]

    // Transfer marketplace contract to multi-sig wallet.
    await marketplace.transferOwnership(marketplaceMultiSig, { from: owner })
    console.log(`marketplace contract owner set to ${marketplaceMultiSig}`)
  }
}

