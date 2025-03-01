import { post } from '@origin/ipfs'
import validator from '@origin/validator'
import IdentityProxy from '@origin/contracts/build/contracts/IdentityProxy_solc'
import txHelper, { checkMetaMask } from '../_txHelper'
import contracts from '../../contracts'
import cost from '../_gasCost'
import parseId from '../../utils/parseId'
import currencies from '../../utils/currencies'
import { proxyOwner, predictedProxy, resetProxyCache } from '../../utils/proxy'
import { swapToTokenTx } from '../uniswap/swapToToken'
import createDebug from 'debug'
const debug = createDebug('origin:makeOffer:')

const ZeroAddress = '0x0000000000000000000000000000000000000000'

async function makeOffer(_, data) {
  await checkMetaMask(data.from)

  const buyer = data.from || contracts.defaultMobileAccount
  const marketplace = contracts.marketplaceExec
  const ipfsData = await toIpfsData(data)
  let mutation = 'makeOffer'

  const affiliateWhitelistDisabled = await marketplace.methods
    .allowedAffiliates(marketplace.options.address)
    .call()

  const affiliate = data.affiliate || contracts.config.affiliate || ZeroAddress
  if (!affiliateWhitelistDisabled) {
    const affiliateAllowed = await marketplace.methods
      .allowedAffiliates(affiliate)
      .call()

    if (!affiliateAllowed) {
      throw new Error('Affiliate not on whitelist')
    }
  }

  // TODO: add defaults for currency, affiliate, etc. so that default invocation
  // is more concise

  const ipfsHash = await post(contracts.ipfsRPC, ipfsData)
  const commission = contracts.web3.utils.toWei(
    ipfsData.commission.amount,
    'ether'
  )
  const value = contracts.web3.utils.toWei(data.value, 'ether')
  const arbitrator = data.arbitrator || contracts.config.arbitrator
  const currency = await currencies.get(data.currency)

  let currencyAddress = currency.address
  if (!currencyAddress) {
    const contractToken = contracts.tokens.find(t => t.symbol === currency.code)
    if (contractToken) {
      currencyAddress = contractToken.id
    }
  }
  if (!currencyAddress) {
    throw new Error(`Could not find token address for ${data.currency}`)
  }

  const { listingId } = parseId(data.listingID)
  const args = [
    listingId,
    ipfsHash,
    ipfsData.finalizes,
    affiliate,
    commission,
    value,
    currencyAddress || ZeroAddress,
    arbitrator
  ]
  if (data.withdraw) {
    const { offerId } = parseId(data.withdraw)
    args.push(offerId)
  }

  let ethValue = currencyAddress === ZeroAddress ? value : 0
  let tx = marketplace.methods.makeOffer(...args)
  if (contracts.config.proxyAccountsEnabled) {
    let owner = await proxyOwner(buyer)
    const isProxy = owner ? true : false
    if (currencyAddress !== ZeroAddress) {
      let proxy = buyer
      if (!owner) {
        owner = buyer
        proxy = await predictedProxy(buyer)
      }
      const Proxy = new contracts.web3Exec.eth.Contract(
        IdentityProxy.abi,
        proxy
      )
      const txData = await tx.encodeABI()

      if (data.autoswap) {
        const swapTx = await swapToTokenTx(value)
        const swapABI = await swapTx.tx.encodeABI()
        tx = Proxy.methods.swapAndMakeOffer(
          owner, // address _owner,
          contracts.marketplace._address, // address _marketplace,
          txData, // bytes _offer,
          contracts.daiExchange._address, // address _exchange,
          swapABI, // bytes _swap,
          currencyAddress, // address _token,
          value // uint _value
        )
        ethValue = swapTx.value // Eth value should cover exchange costs
        if (isProxy) {
          mutation = 'swapAndMakeOffer'
        }
        debug(`attempting to autoswap ${value} Eth`)
      } else {
        debug('transferTokenMarketplaceExecute', { value, currencyAddress })
        tx = Proxy.methods.transferTokenMarketplaceExecute(
          owner,
          contracts.marketplace._address,
          txData,
          currencyAddress,
          value
        )
        mutation = 'transferTokenMarketplaceExecute'
      }
    }
  }

  return txHelper({
    tx,
    from: buyer,
    mutation,
    gas: cost.makeOffer,
    value: ethValue,
    onConfirmation: () => resetProxyCache()
  })
}

async function toIpfsData(data) {
  const { listingId } = parseId(data.listingID)
  const listing = await contracts.eventSource.getListing(listingId)
  const web3 = contracts.web3

  // Validate units purchased vs. available
  const unitsAvailable = Number(listing.unitsAvailable)
  const offerQuantity = Number(data.quantity)
  if (offerQuantity > unitsAvailable) {
    throw new Error(
      `Insufficient units available (${unitsAvailable}) for offer (${offerQuantity})`
    )
  }

  const commission = { currency: 'OGN', amount: '0' }
  if (data.commission) {
    // Passed in commission takes precedence
    commission.amount = web3.utils.fromWei(data.commission, 'ether')
  } else if (listing.commissionPerUnit) {
    // Default commission to min(depositAvailable, commissionPerUnit)
    const amount = web3.utils
      .toBN(listing.commissionPerUnit)
      .mul(web3.utils.toBN(data.quantity))
    const depositAvailable = web3.utils.toBN(listing.depositAvailable)
    const commissionWei = amount.lt(depositAvailable)
      ? amount.toString()
      : depositAvailable.toString()
    commission.amount = web3.utils.fromWei(commissionWei, 'ether')
  }

  const ipfsData = {
    schemaId: 'https://schema.originprotocol.com/offer_2.0.0.json',
    listingId: data.listingID,
    listingType: 'unit',
    unitsPurchased: Number.parseInt(data.quantity),
    totalPrice: {
      amount: data.value,
      currency: data.currency
    },
    commission,
    finalizes: data.finalizes || 60 * 60 * 24 * 14,
    ...(data.fractionalData || {})
  }

  validator('https://schema.originprotocol.com/offer_2.0.0.json', ipfsData)

  return ipfsData
}

export default makeOffer
