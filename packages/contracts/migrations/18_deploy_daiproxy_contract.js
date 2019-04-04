const DaiProxy = artifacts.require('./DaiProxy.sol')
const Marketplace = artifacts.require('./V00_Marketplace.sol')

const DaiStableCoinAddress = '0x0000000000000000000000000000000000000000'
const DaiUniswapExchangeAddress = '0x0000000000000000000000000000000000000000'

module.exports = function(deployer, network) {
  return deployer.then(() => {
    return deployContracts(deployer, network)
  })
}

async function deployContracts(deployer, network) {
  const marketplace = await Marketplace.deployed()
  await deployer.deploy(DaiProxy, marketplace.address, DaiStableCoinAddress, DaiUniswapExchangeAddress)
}

