import redis from 'redis'
import origin, { web3 } from './../services/origin'
import db from './../models/'
import extractAttestInfo from './../utils/extract-attest'
import querystring from 'querystring'

const CHANNEL_PREFIX = "webrtc."
const CHANNEL_ALL = "webrtcall"

const emptyAddress = '0x0000000000000000000000000000000000000000'

function getFullId(listingId, offerId) {
  return `${listingId}-${offerId}`
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

    this.activeAddresses[ethAddress] = 1 + (this.activeAddresses[ethAddress] || 0)

    this.redisSub.on("subscribe", (channel, count) => {
      if (channel == CHANNEL_ALL) {
        this.publish(CHANNEL_ALL, {from:this.subscriberEthAddress, join:1})
      }
    })

    this.msgHandlers = [this.handleSubscribe, this.handleExchange, this.handleLeave, this.handleDisableNotification, this.handleNotification, this.handleSetPeer]

    this.setUserInfo()
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
    for (const peer of this.peers) {
      //leave all other conversations
      if(peer != ethAddress)
      {
        this.removePeer(peer)
      }
    }
    this.peers = [ethAddress]
  }

  handleSubscribe({ethAddress, subscribe}) {
    if (subscribe)
    {
      (async () => {
        const {offer, accept} = subscribe
        if (offer) {
          const { listingID, offerID } = subscribe.offer
          const offer = await this.logic.getOffer(listingID, offerID)
          console.log("Offer is:", offer)

          // TODO: we need a price on this offer so need to load up profiles here as well
          if (offer && offer.active && !offer.dismissed
            && offer.from == this.subscriberEthAddress && (offer.to == emptyAddress || offer.to == ethAddress))
          {
            if (!offer.lastNotify || (new Date() - offer.lastNotify) > 1000 * 60* 60* 6) {
              if (offer.started) {
                this.logic.sendNotificationMessage(ethAddress, `${this.getName()} would like to continue your conversation.`)
              } else {
                this.logic.sendNotificationMessage(ethAddress, `You have received an offer to talk for ${offer.amount} ETH from ${this.getName()}.`)
              }
              offer.lastNotify = new Date()
              offer.save()
            }
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
            && (offer.to == this.subscriberEthAddress || offer.to == emptyAddress) && offer.from == ethAddress
            && (this.logic.isOfferAccepted(offer) || signature))
          {
            if (offer.started) {
              this.logic.sendNotificationMessage(ethAddress, `${this.getName()} would like to continue your conversation.`)
            } else {
              this.logic.sendNotificationMessage(ethAddress, `${this.getName()} has accepted your invtation to talk.`)
            }
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

  handleOfferStarted({ offerStarted }) {
    if (offerStarted) {
      (async () => {
        const { listingID, offerID } = subscribe.offer
        const offer = await this.logic.getOffer(listingID, offerID)
        if (offer.to == this.subscriberEthAddress && offer.accepted) {
          offer.started = true
          await offer.save()
        }
      })()
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
      const {deviceToken, deviceType} = notification
      const {walletToken} = this
      const ethAddress = this.subscriberEthAddress
      const lastOnline = new Date()
      if (walletToken && ethAddress) {
        (async () => {
          const notify = await db.WebrtcNotificationEndpoint.findOne({ where:{ walletToken } })
          if (notify) {
            await notify.update({ active:true, ethAddress, deviceToken, deviceType, lastOnline } )
          } else {
            await db.WebrtcNotificationEndpoint.upsert({ walletToken, active:true, ethAddress, deviceToken, deviceType, lastOnline } )
          }
        })()
      }
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
    this.publish(CHANNEL_ALL, {left:1})
    const ethAddress = this.subscriberEthAddress
    if (this.activeAddresses[ethAddress] > 1)
    {
      this.activeAddresses[ethAddress] -= 1
    } else {
      delete this.activeAddresses[ethAddress]
    }
  }
}


export default class Webrtc {
  constructor(linker) {
    this.redis = redis.createClient(process.env.REDIS_URL)
    this.activeAddresses = {}
    this.linker = linker
    this.initContract()
  }

  async initContract() {
    this.contract = await origin.contractService.deployed(origin.contractService.marketplaceContracts.VA_Marketplace)
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

  async submitUserInfo(ipfsHash) {
    const info = await origin.ipfsService.loadObjFromFile(ipfsHash)
    // we should verify the signature for this
    console.log("submitting ipfsHash:", ipfsHash)
    await db.UserInfo.upsert({ethAddress:info.address, ipfsHash, info})
    return true
  }

  async getUserInfo(ethAddress) {
    const userInfo = await db.UserInfo.findOne({ where: {ethAddress } })
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
      userInfo.info.attests = attests.filter(a => a.verified)
    }
    if (userInfo) {
      return userInfo.info
    }
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

  async getOffer(listingID, offerID) {
    const fullId = getFullId(listingID, offerID)
    const contractOffer = filterObject(await this.contract.methods.offers(listingID, offerID).call())

    if (!contractOffer){
      const dbOffer = await db.WebrtcOffer.findOne({ where: {fullId}})
      dbOffer.active = false
      await dbOffer.save()
      return dbOffer
    }

    const intStatus = Number(contractOffer.status)

    const offer = {
      from : contractOffer.buyer,
      to : contractOffer.seller,
      fullId,
      amount : web3.utils.fromWei( web3.utils.toBN(contractOffer.value).sub(web3.utils.toBN(contractOffer.refund))),
      amountType: 'eth',
      info: {listingID, offerID, contractOffer},
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
    return Number(offer.info.contractOffer.status) == 2
  }
}
