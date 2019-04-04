import assert from 'assert'
import helper, { contractPath } from './_helper'
import { IpfsHash } from './_marketplaceHelpers'
import { exchangeAbi, exchangeBytecode, factoryAbi, factoryBytecode } from './../_abi/UniswapExchange.js'

async function deployUniswapExchange({ web3, Owner, DaiContractAddress, deployWithBytecode }) {

  const factory = await deployWithBytecode({
    abi: factoryAbi,
    bytecode: factoryBytecode,
    from: Owner,
    args: [],
    deployGas: 4000000
  })

  const exchangeTemplate = await deployWithBytecode({
    abi: exchangeAbi,
    bytecode: exchangeBytecode,
    from: Owner,
    args: [],
    deployGas: 4000000
  })

  await factory.methods
    .initializeFactory(exchangeTemplate._address)
    .send({ from: Owner, gas: 4000000 })

  let res = await factory.methods
    .createExchange(DaiContractAddress)
    .send({ from: Owner, gas: 4000000 })

  const daiExchange = new web3.eth.Contract(exchangeAbi, res.events.NewExchange.returnValues.exchange)
  
  console.log(`------------------------------------------------------------------`)
  console.log(`DAI Exchange created at ${daiExchange._address}`)

  const blockNumber = await web3.eth.getBlockNumber()
  const block = await web3.eth.getBlock(blockNumber)

  await daiExchange.methods.addLiquidity(web3.utils.toWei('0.5', 'ether'), web3.utils.toWei('5000', 'ether'), block.timestamp + 3600).send({
    from: Owner, gas: 4000000, value: web3.utils.toWei('0.5', 'ether')
  })

  console.log(`------------------------------------------------------------------`)
  console.log(`Liquidity added`)

  return daiExchange
}

describe('DaiProxy.sol', async function() {
  this.timeout(60000);

  let accounts, deploy, web3
  let Marketplace,
    OriginToken,
    DaiStableCoin,
    Buyer,
    DaiProxy,
    UniswapExchange,
    Owner,
    Seller,
    Seller2,
    SellerIdentity,
    Affiliate,
    Arbitrator,
    MarketArbitrator,
    ArbitratorAddr,
    deployWithBytecode

  before(async function() {
    ({ deploy, accounts, web3, deployWithBytecode } = await helper(`${__dirname}/..`))

    Owner = accounts[0]
    Seller = accounts[1]
    Buyer = accounts[2]
    ArbitratorAddr = accounts[3]
    Seller2 = accounts[4]
    Affiliate = accounts[5]

    OriginToken = await deploy('OriginToken', {
      from: Owner,
      path: `${contractPath}/token/`,
      args: [12000]
    })

    DaiStableCoin = await deploy('Token', {
      from: Owner,
      path: `${__dirname}/contracts/`,
      args: ['Dai', 'DAI', 2, 12000]
      // args: [12000]
    })

    Arbitrator = await deploy('CentralizedArbitrator', {
      from: ArbitratorAddr,
      path: `${__dirname}/contracts/arbitration/`,
      args: [0]
    })

    MarketArbitrator = await deploy('OriginArbitrator', {
      from: ArbitratorAddr,
      path: `${__dirname}/contracts/`,
      args: [Arbitrator._address]
    })

    Marketplace = await deploy('V00_Marketplace', {
      from: Owner,
      // path: `${__dirname}/contracts/`,
      path: `${contractPath}/marketplace/v00`,
      file: 'Marketplace.sol',
      args: [OriginToken._address]
    })

    SellerIdentity = await deploy('ClaimHolder', {
      from: Seller,
      path: `${contractPath}/identity/`
    })

    // UniswapExchange = await deployWithBytecode({
    //   from: Owner,
    //   abi: exchangeAbi,
    //   bytecode: exchangeBytecode,
    //   args: []
    // })

    await Marketplace.methods.addAffiliate(Affiliate, IpfsHash).send()
    await OriginToken.methods.transfer(Seller, 400).send()
    await OriginToken.methods.transfer(Seller2, 400).send()
    await OriginToken.methods.transfer(SellerIdentity._address, 400).send()
    await DaiStableCoin.methods.transfer(Buyer, 400).send()
    await OriginToken.methods
      .addCallSpenderWhitelist(Marketplace._address)
      .send({ from: Owner })

    UniswapExchange = await deployUniswapExchange({
      web3,
      Owner,
      DaiContractAddress: DaiStableCoin._address,
      deployWithBytecode
    });

    DaiProxy = await deploy('DaiProxy', {
      from: Owner,
      path: `${contractPath}/proxy/`,
      file: 'DaiProxy.sol',
      args: [Marketplace._address, DaiStableCoin._address, UniswapExchange._address]
    })
    
    // await UniswapExchange.methods.setup(DaiStableCoin._address).send({ from: Owner })

    // await UniswapExchange.methods.addLiquidity('0', web3.utils.toWei('0.5', 'ether'), web3.utils.toWei('5000', 'ether')).send({
    //   from: Owner, gas: 4000000, value: web3.utils.toWei('0.5', 'ether')
    // })
  })

  describe('A listing in DAI', function() {
    
    let listingID
    it('should allow a new listing to be added', async function() {
      await OriginToken.methods
        .approve(Marketplace._address, 50)
        .send({ from: Seller })

      const result = await Marketplace.methods
        .createListing(IpfsHash, 50, Seller)
        .send({ from: Seller })

      listingID = result.events.ListingCreated.returnValues.listingID

      assert(result)
    })

    it('should make offer with dai', async function() {
      console.log(`---------------------------------CALL---------------------`)

      const blockNumber = await web3.eth.getBlockNumber()
      const block = await web3.eth.getBlock(blockNumber)

      const args = [
        150,
        listingID,
        IpfsHash,
        block.timestamp + 60 * 120,
        Affiliate,
        2,
        "1000000000000000000",
        MarketArbitrator._address
      ];

      const result = await DaiProxy.methods
        .makeOfferWithDai(...args)
        .send({ from: Buyer, value: "1000000000000000000", gas: 100000000 })

      assert(result)

      console.log(`---------------------------------DONE---------------------`)
      const offer = await Marketplace.methods.offers(listingID, 0).call()
      assert.equal(offer.buyer, Buyer)
    })
  })
})
