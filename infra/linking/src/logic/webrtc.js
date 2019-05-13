import redis from 'redis'
import origin, { web3 } from './../services/origin'
import db from './../models/'
import extractAttestInfo from './../utils/extract-attest'
import querystring from 'querystring'

const CHANNEL_PREFIX = "webrtc."
const CHANNEL_ALL = "webrtcall"

const emptyAddress = '0x0000000000000000000000000000000000000000'

function getFullId(listingID, offerID) {
  return `${listingID}-${offerID}`
}

function splitFullId(fullId) {
  const ids = fullId.split('-')
  return {listingID:ids[0], offerID:ids[1]}

}

// Objects returned from web3 often have redundant entries with numeric
// keys, so we filter those out.
const filterObject = (obj) => {
  const filteredObj = {}
  for (const [key, value] of Object.entries(obj)) {
    if (isNaN(parseInt(key[0], 10))) {
      filteredObj[key] = value
    }
  }
  return filteredObj
}

class WebrtcSub {
  constructor(ethAddress, redis, redisSub, activeAddresses, logic, walletToken) {
    redisSub.subscribe(CHANNEL_PREFIX + ethAddress)
    redisSub.subscribe(CHANNEL_ALL)
    this.activeAddresses = activeAddresses
    this.peers = []
    this.redis = redis
    this.redisSub = redisSub
    this.subscriberEthAddress = ethAddress
    this.walletToken = walletToken
    this.logic = logic


    this.redisSub.on("subscribe", (channel, count) => {
      if (channel == CHANNEL_ALL) {
        if (this.active) {
          this.publish(CHANNEL_ALL, {from:this.subscriberEthAddress, join:1})
        }
      }
    })

    this.msgHandlers = [this.handleSubscribe, this.handleExchange, this.handleLeave, this.handleDisableNotification, this.handleNotification, this.handleSetPeer, this.handleVoucher, this.handleGetOffers]

    this.setUserInfo()
  }

  setActive() {
    if (!this.active) {
      const ethAddress = this.subscriberEthAddress
      this.activeAddresses[ethAddress] = 1 + (this.activeAddresses[ethAddress] || 0)
      this.active = true
      this.publish(CHANNEL_ALL, {from:this.subscriberEthAddress, join:1})
    }
  }

  removeActive() {
    if (this.active) {
      const ethAddress = this.subscriberEthAddress
      if (this.activeAddresses[ethAddress] > 1)
      {
        this.activeAddresses[ethAddress] -= 1
      } else {
        delete this.activeAddresses[ethAddress]
      }
      this.publish(CHANNEL_ALL, {left:1})
      this.active = false
    }
  }

  async setUserInfo() {
    this.userInfo = await this.logic.getUserInfo(this.subscriberEthAddress)
  }

  getName() {
    return (this.userInfo && this.userInfo.name) || this.subscriberEthAddress
  }

  publish(channel, data) {
    this.redis.publish(channel, JSON.stringify(data))
  }

  onServerMessage(handler) {
    this.redisSub.on('message', (channel, msg) => {
      const {from, subscribe} = JSON.parse(msg)
      const { offer, accept } = subscribe || {}
      if (channel == CHANNEL_ALL || this.peers.includes(from) || offer || accept)
      {
        console.log("sending message to client:", msg)
        try {
          handler(msg)
        } catch(error) {
          console.log(error)
        }
      }
    })
    this.msgHandler = handler
  }

  removePeer(ethAddress) {
    if (this.peers.includes(ethAddress)) {
      this.peers = this.peers.filter(a => a != ethAddress)
      this.publish(CHANNEL_PREFIX + ethAddress, {from:this.subscriberEthAddress, leave:1})
    }
  }

  addPeer(ethAddress) {
    if(!this.peers.includes(ethAddress)) {
      this.peers.push(ethAddress)
    }
  }

  setActivePeer(ethAddress) {
    if (this.peers)
    {
      for (const peer of this.peers) {
        //leave all other conversations
        if(peer != ethAddress)
        {
          this.removePeer(peer)
        }
      }
    }
    this.peers = [ethAddress]
  }

  decorateOffer(e, offer) {
    e.amount = offer.amount
    e.amountType = offer.amountType
    e.totalValue = offer.contractOffer.totalValue
    e.status = offer.contractOffer.status
    if (offer.initInfo)
    {
      e.terms = offer.initInfo.offerTerms
    }
    if (offer.lastVoucher)
    {
      e.lastVoucher = offer.lastVoucher
    }
  }

  handleSubscribe({ethAddress, subscribe}) {
    if (subscribe)
    {
      (async () => {
        const {offer, accept} = subscribe
        if (offer) {
          const { listingID, offerID, transactionHash, blockNumber } = subscribe.offer
          const offer = await this.logic.getOffer(listingID, offerID, transactionHash, blockNumber )
          console.log("Offer is:", offer)

          // TODO: we need a price on this offer so need to load up profiles here as well
          if (offer && offer.active && !offer.dismissed
            && offer.from == this.subscriberEthAddress && (!offer.to || offer.to == ethAddress))
          {
            if (!offer.lastNotify || (new Date() - offer.lastNotify) > 1000 * 60* 60* 6) {
              if (offer.lastVoucher) {
                this.logic.sendNotificationMessage(ethAddress, `${this.getName()} would like to continue your conversation.`)
              } else {
                this.logic.sendNotificationMessage(ethAddress, `You have received an offer to talk for ${offer.amount} ETH from ${this.getName()}.`)
              }
              offer.lastNotify = new Date()
              offer.save()
            }

            this.decorateOffer(subscribe.offer, offer)

            // this is a good offer
            this.publish(CHANNEL_PREFIX + ethAddress, {from:this.subscriberEthAddress, subscribe})
          }
        } else if (accept) {
          const {
            listingID,
            offerID,
            ipfsHash,
            behalfFee,
            signature
          } = subscribe.accept
          const offer = await this.logic.getOffer(listingID, offerID)

          if (offer && offer.active && !offer.dismissed
            && (offer.to == this.subscriberEthAddress || !offer.to) && offer.from == ethAddress
            && (this.logic.isOfferAccepted(offer) || signature))
          {
            if (offer.lastVoucher) {
              this.logic.sendNotificationMessage(ethAddress, `${this.getName()} would like to continue your conversation.`)
            } else {
              this.logic.sendNotificationMessage(ethAddress, `${this.getName()} has accepted your invtation to talk.`)
            }

            //if we have a voucher from before send it
            this.decorateOffer(subscribe.accept, offer)
            this.publish(CHANNEL_PREFIX + ethAddress, {from:this.subscriberEthAddress, subscribe})
          }
        }
      }) ()
      return true
    }
  }

  handleSetPeer({activePeer}) {
    if (activePeer) {
      this.setActivePeer(activePeer)
      return true
    }
  }

  handleExchange({ethAddress, exchange}) {
    if (exchange){
      if (ethAddress == this.subscriberEthAddress) {
        console.log("Trying to subscribe to self:", ethAddress)
      } else {
        this.publish(CHANNEL_PREFIX + ethAddress, {from:this.subscriberEthAddress, exchange})
      }
      return true
    }
  }

  handleLeave({ethAddress, leave}){
    if (leave) {
      this.removePeer(ethAddress)
      return true
    }
  }

  handleDisableNotification({disableNotification}) {
    if (disableNotification) {
      this.removeActive()
      const {walletToken} = this
      if (walletToken) {
        (async () => {
          const notify = await db.WebrtcNotificationEndpoint.findOne({ where: { walletToken } })
          if (notify) {
            notify.active = false
            await notify.save()
          }
        })()
      }
      return true
    }
  }

  handleNotification({notification}) {
    if (notification) {
      this.setActive()
      const {deviceToken, deviceType} = notification
      const {walletToken} = this
      const ethAddress = this.subscriberEthAddress
      const lastOnline = new Date()
      if (walletToken && ethAddress) {
        (async () => {
          const notify = await db.WebrtcNotificationEndpoint.findOne({ where:{ walletToken } })
          if (notify) {
            await notify.update({ active:true, ethAddress, deviceToken, deviceType, lastOnline })
          } else {
            await db.WebrtcNotificationEndpoint.upsert({ walletToken, active:true, ethAddress, deviceToken, deviceType, lastOnline } )
          }
        })()
      }
      return true
    }
  }

  handleVoucher({ethAddress, voucher}) {
    if(voucher) {
      (async () => {
        if(this.logic.updateIncreasingVoucher(ethAddress, voucher)) {
          this.publish(CHANNEL_PREFIX + ethAddress, {from:this.subscriberEthAddress, voucher})
        }
      })()
      return true
    }
  }

  handleGetOffers({getOffers}) {
    if (getOffers) {
      (async () => {
        const options = getOffers
        const pendingOffers = await this.logic.getOffers(this.subscriberEthAddress, options)
        this.msgHandler(JSON.stringify({pendingOffers}))
      })()
      return true
    }
  }


  clientMessage(msgObj) {
    console.log("We have a message from the client:", msgObj)
    for (const handler of this.msgHandlers) {
      if (handler.call(this, msgObj) ) {
        return
      }
    }
  }

  async clientClose() {
    for (const peer of this.peers) {
      this.removePeer(peer)
    }
    await this.redisSub.quit()
    this.removeActive()
  }
}


export default class Webrtc {
  constructor(linker, hot) {
    this.redis = redis.createClient(process.env.REDIS_URL)
    this.activeAddresses = {}
    this.linker = linker
    this.hot = hot
    this.initContract()
  }

  async initContract() {
    this.contract = await origin.contractService.deployed(origin.contractService.marketplaceContracts.VB_Marketplace)
  }

  subscribe(ethAddress, authSignature, message, rules, timestamp, walletToken) {
    console.log("call subscribing...", ethAddress)
    if (!(message.includes(rules.join(",")) && message.includes(timestamp))) {
      throw new Error("Invalid subscription message sent")
    }

    if (walletToken && !message.includes(walletToken)) {
      throw new Error("Signature message does not include the wallet token")
    }

    const currentDate = new Date()
    const tsDate = new Date(timestamp)
    console.log("subscribing...", ethAddress)
    const recovered = web3.eth.accounts.recover(message, authSignature)
    // we keep thje signature fresh for every 15 days
    if (ethAddress == recovered && currentDate - tsDate < 15 * 24 * 60 * 60 * 1000)
    {
      if (rules.includes("VIDEO_MESSAGE"))
      {
        console.log("Authorized connection for:", ethAddress)
        return new WebrtcSub(ethAddress, this.redis, this.redis.duplicate(), this.activeAddresses, this, walletToken)
      }
    }
    console.error("signature mismatch:", recovered, " vs ", ethAddress)
    throw new Error(`We cannot auth the signature`)
  }

  async getActiveAddresses() {
    const onlineActives = Object.keys(this.activeAddresses)
    const activeNotifcations = await db.WebrtcNotificationEndpoint.findAll({ where: { active:true } })

    for (const notify of activeNotifcations) {
      if (!onlineActives.includes(notify.ethAddress))
      {
        onlineActives.push(notify.ethAddress)
      }
    }
    return onlineActives
  }

  async submitUserInfo(ipfsHash) {
    const info = await origin.ipfsService.loadObjFromFile(ipfsHash)
    // we should verify the signature for this
    if (await this.hot.verifyProfile(info))
    {
      console.log("submitting ipfsHash:", ipfsHash)
      await db.UserInfo.upsert({ethAddress:info.address, ipfsHash, info})
      this.redis.publish(CHANNEL_ALL, JSON.stringify({from:info.address, updated:1}))
      return true
    }
    return false
  }

  async getUserInfo(ethAddress) {
    let info = {}
    const userInfo = await db.UserInfo.findOne({ where: {ethAddress } })
    if (userInfo)
    {
      info = userInfo.info
    }

    if (userInfo && userInfo.info.attests) {
      const attestedSites = await db.AttestedSite.findAll({where:{ethAddress, verified:true}})
      const attests = userInfo.info.attests
      for (const attest of attests.slice()) {
        attest.verified = false
        for(const attested of attestedSites) {
          if (attested.accountUrl == attest.accountUrl 
            && attested.site == attest.site 
            && attested.account == attest.account)
          {
            attest.verified = true
          }
        }
      }
      info.attests = attests.filter(a => a.verified)
    }
    info.active = ethAddress in this.activeAddresses
    return info
  }

  async getAllAttests(ethAddress) {
    // TODO: this might need to be secured
    const attestedSites = await db.AttestedSite.findAll({where:{ethAddress, verified:true}})
    const result = []

    for (const attestedSite of attestedSites) {
      const {site, account, accountUrl} = attestedSite

      const inboundLinks = await db.InboundAttest.findAll({where:{attestedSiteId:attestedSite.id}})

      const links = inboundLinks.map(l => l.sanitizedUrl)

      result.push({site, account, accountUrl, links})
    }

    return result
  }

  async registerReferral(ethAddress, attestUrl, referralUrl) {
    const a = new URL(attestUrl)
    const query = querystring.parse(a.search.substring(1))
    if (!(query.p == ethAddress && "attest" in query))
    {
      // TODO:need to make sure domain matches as well! 
      // a.host  == some config value
      throw new Error(`${attestUrl} does not match ${ethAddress}`)
    }
    const inbound = await db.InboundAttest.findOne({ where: {ethAddress, url:referralUrl } })

    if (!inbound || !inbound.verified) {
      // TODO: check the update time so that we don't hammer the sites
      const {site, account, accountUrl, sanitizedUrl} = await extractAttestInfo(attestUrl, referralUrl)

      if (site && account)
      {
        let attested = await db.AttestedSite.findOne({ where: {ethAddress, site, account}})
        if (!attested) {
          attested = await db.AttestedSite.create({ethAddress, site, account, accountUrl, verified:true})
        }
        await db.InboundAttest.upsert({attestedSiteId:attested.id, ethAddress, url:referralUrl, verified:true, sanitizedUrl})
        return {site, account, accountUrl, links:[sanitizedUrl]}
      }
    }
  }

  async verifyAcceptOffer(ethAddress, ipfsHash, behalfFee, sig, listingID, offerID) {
    const offer = await this.getOffer(listingID, offerID)

    // it's an active offer to an url
    if (offer.active && offer.to.startsWith("http")) {
      //let's verify that it's from the right account
      const attested = await db.AttestedSite.findOne({ where: {ethAddress, accountUrl:offer.to} })
      if (attested && attested.verified) {
        if (this.hot.checkMinFee(behalfFee)) {
          return this.hot._submitMarketplace("verifyAcceptOfferOnBehalf", 
            [listingID, offerID, ipfsHash, behalfFee, ethAddress, sig.v, sig.r, sig.s])
        }

      }
    }
    return {}
  }

  async updateIncreasingVoucher(ethAddress, voucher) {
    //
    // TODO: move this to client side later
    //
    const {listingID, offerID, ipfsHash, fee, payout, signature} = voucher
    const offer = await this.getOffer(listingID, offerID)

    if(offer.active && offer.accepted && offer.seller == ethAddress && fee =='0'){
      const BNpayout = web3.utils.toBN(payout)
      if (web3.utils.toBN(offer.contractOffer.totalValue).lt(BNpayout)) {
        //payout too large
        return
      }
      if (offer.lastVoucher) {
        if (web3.utils.toBN(offer.lastVoucher.payout).gte(BNpayout))
        {
          return
        }
      }

      const recoveredAddress = await this.hot.recoveredFinalize(listingID, offerID, ipfsBytes, payout, fee, signature)
      if (recoverAddress == offer.verifier)
      {
        await offer.update({lastVoucher:voucher})
        return true
      }

      if(recoveredAddress == this.hot.account.address && (recoveredAddress == offer.seller || recoveredAddress == offer.initInfo.offerTerms.sideVerifier)) 
      {
        await offer.update({lastVoucher:voucher})
        return true
      }
    }
  }

  async verifyServerFinalize(listingID, offerID, ipfsBytes, verifyFee, payout, sig) {
    const offer = await this.getOffer(listingID, offerID)

    if(offer.active && offer.contractOffer.verifier == this.hot.account.address){
      const recoveredAddress = await this.hot.recoveredFinalize(listingID, offerID, ipfsBytes, payout, verifyFee, sig)
      return recoveredAddress == offer.seller || recoveredAddress == offer.initInfo.offerTerms.sideVerifier
    }

  }

  async verifySubmitFinalize(listingID, offerID, ipfsHash, behalfFee, fee, payout, sellerSig, sig) {
    if (await this.verifyServerFinalize(listingID, offerID, ipfsHash, fee, payout, sig)) {
      //rewrite the sig to use the server verifier
      sig = await this.hot.signFinalize(listingID, offerID, ipfsHash, payout, fee)
    }
    return this.hot.submitMarketplace('verifiedOnBehalfFinalize',
        [listingID, offerID, ipfsHash, behalfFee, fee, payout, sellerSig.v, sellerSig.r, sellerSig.s, sig.v, sig.r, sig.s]
    )
  }

  async getOffer(listingID, offerID, transactionHash, blockNumber) {
    const fullId = getFullId(listingID, offerID)
    const contractOffer = filterObject(await this.contract.methods.offers(listingID, offerID).call())

    if (!contractOffer){
      const dbOffer = await db.WebrtcOffer.findOne({ where: {fullId}})
      dbOffer.active = false
      await dbOffer.save()
      return dbOffer
    }

    const intStatus = Number(contractOffer.status)

    let to = contractOffer.seller
    if (to == emptyAddress) {
      to = undefined
    }

    // grab info if available...
    let initInfo
    if (transactionHash && blockNumber) {
      console.log("grabbing event from:", transactionHash, blockNumber, contractOffer.buyer, listingID, offerID)
      await new Promise((resolve, reject) => {
        this.contract.getPastEvents('OfferCreated', {
          filter: {party:contractOffer.buyer, listingID, offerID},
          fromBlock:blockNumber,
          toBlock:blockNumber
        }, (error, events) => {
          if (events.length > 0 )
          {
            const event = events[0]
            console.log("event retreived:", event, error)
            if (event && event.transactionHash == transactionHash) {
              const offerCreated = filterObject(event.returnValues)
              initInfo = {offerCreated, transactionHash, blockNumber}
              console.log("initInfo:", initInfo)
            }
          }
          resolve(true);
        })
      })
      if (initInfo && initInfo.offerCreated.ipfsHash)
      {
        const offerTerms =  await origin.ipfsService.loadObjFromFile(
          origin.contractService.getIpfsHashFromBytes32(initInfo.offerCreated.ipfsHash)
        )
        // if there's no to address then we this is an open offer and we want to check if there's a 
        // different term for it
        if (!to && offerTerms.toVerifiedUrl && contractOffer.verifier == this.hot.account.address) {
          to = offerTerms.toVerifiedUrl
        }
        initInfo.offerTerms = offerTerms
      }
    }

    contractOffer.totalValue = web3.utils.toBN(contractOffer.value).sub(web3.utils.toBN(contractOffer.refund)).toString()

    const offer = {
      from : contractOffer.buyer,
      to,
      fullId,
      amount : web3.utils.fromWei( contractOffer.totalValue ),
      amountType: 'eth',
      contractOffer,
      initInfo,
      active: intStatus == 1 || intStatus == 2
    }
    await db.WebrtcOffer.upsert(offer)
    return db.WebrtcOffer.findOne({ where: {fullId}})
  }

  async sendNotificationMessage(ethAddress, msg, data) {
    const notifees = await db.WebrtcNotificationEndpoint.findAll({ where: { ethAddress, active:true } })
    for (const notify of notifees) {
      this.linker.sendNotify(notify, msg, data)
    }
  }

  isOfferAccepted(offer) {
    return Number(offer.contractOffer.status) == 2
  }

  async getOffers(ethAddress, options) {
    const result = []
    const offers = await db.WebrtcOffer.findAll({where: {
      ...options,
      [db.Sequelize.Op.or]: [ {to:ethAddress}, {from:ethAddress} ] }})
    for (const offer of offers) {
      const {listingID, offerID} = splitFullId(offer.fullId)
      //update the id from the blockchain hopefully it's still active
      const updatedOffer = await this.getOffer(listingID, offerID)
      if (updatedOffer.active)
      {
        result.push(updatedOffer.get({plain:true}))
      }
    }
    return result
  }
}
