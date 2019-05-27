import redis from 'redis'
import origin, { web3 } from './../services/origin'
import db from './../models/'
import extractAttestInfo, {extractAccountStat} from './../utils/extract-attest'
import createHtml from './../utils/static-web'
import { getEthToUSDRate } from './../utils/currency'
import { setTurnCred } from './../utils/turn'
import { sha3_224 } from 'js-sha3'
import querystring from 'querystring'
import _ from 'lodash'

import AttestationError from 'utils/attestation-error'
import logger from 'logger'

const CHANNEL_PREFIX = "webrtc."
const CHANNEL_ALL = "webrtcall"

const emptyAddress = '0x0000000000000000000000000000000000000000'

const TURN_KEY = process.env.TURN_KEY
const TURN_PREFIX = process.env.TURN_PREFIX
const TURN_HOST = process.env.TURN_HOST

const CALL_STARTED = 'started'
const CALL_DECLINED = 'declined'
const CALL_ENDED = 'ended'

const CALL_COUNT_PREFIX = 'count.'
const CALL_DECLINE_PREFIX = "decline."

const DECLINE_SECONDS = 5* 60 //decline lasts for 60 seconds

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

    this.incomingMsgHandlers = [this.handleApiVersion, this.handleSubscribe, this.handleExchange, this.handleLeave, this.handleDisableNotification, 
      this.handleNotification, this.handleSetPeer, this.handleVoucher, this.handleGetOffers, this.handleRead, this.handleReject, 
      this.handleDismiss, this.handleCollected, this.handleStartSession]

    this.setUserInfo()
    this.getPendingOffers({ignoreBlockchain:true})
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
    // set active only after user info is gotten
    this.setActive()
  }

  getName() {
    return (this.userInfo && this.userInfo.name) || this.subscriberEthAddress
  }

  getMinCost() {
    return web3.utils.toWei((this.userInfo && this.userInfo.minCost) || '0.01')
  }

  publish(channel, data, callback) {
    this.redis.publish(channel, JSON.stringify(data), callback)
  }

  onServerMessage(handler) {
    this.redisSub.on('message', (channel, msg) => {
      const {from, subscribe, updated, rejected, collected, declined} = JSON.parse(msg)
      const { offer, accept } = subscribe || {}
      if (channel == CHANNEL_ALL || this.peers.includes(from) || offer || accept || rejected || collected || declined)
      {
        logger.info("sending message to client:", msg)
        try {
          handler(msg)
        } catch(error) {
          logger.info(error)
        }
      }
      if(channel == CHANNEL_ALL && from == this.subscriberEthAddress && updated) {
        this.setUserInfo()
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

  sendMsg(msg) {
    this.msgHandler(JSON.stringify(msg))
  }

  sendOffer(updatedOffer) {
    this.sendMsg({updatedOffer})
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

  getTurn(ethAddress, offer) {
    const pass = sha3_224(`${TURN_KEY}:${ethAddress}:${offer.fullId}`).slice(0, 16)
    const prefix = TURN_PREFIX
    setTurnCred(prefix+ethAddress.slice(2), pass)
    return {pass, prefix, host:TURN_HOST}
  }


  handleApiVersion({apiVersion}) {
    if (apiVersion) {
      const version = this.logic.linker.apiVersion
      if (Number(apiVersion) < Number(version)){
        this.sendMsg({updateRequired:{version}})
      }
      return true
    }
  }

  getCallKey(to, offer) {
    return `call.${to}.${offer.listingID}.${offer.offerID}`
  }

  async getRedis(key) {
    return new Promise((resolve, reject) => {
      this.redis.get(key, (err, reply) => {
        if (err) {
          reject(err)
        } else {
          resolve(reply)
        }
      })
    })
  }

  async incrRedis(key) {
    return new Promise((resolve, reject) => {
      this.redis.incr(key, (err, reply) => {
        if (err) {
          reject(err)
        } else {
          resolve(Number(reply))
        }
      })
    })
  }

  async checkDeclined(ethAddress, offer) {
    const declineCheckKey = CALL_DECLINE_PREFIX + this.getCallKey(ethAddress, offer)
    return this.getRedis(declineCheckKey)
  }

  clearDeclined(offer) {
    const declineCheckKey = CALL_DECLINE_PREFIX + this.getCallKey(this.subscriberEthAddress, offer)
    this.redis.del(declineCheckKey)
  }

  setDeclined(offer) {
    const declineCheckKey = CALL_DECLINE_PREFIX + this.getCallKey(this.subscriberEthAddress, offer)
    this.redis.set(declineCheckKey, '1', 'EX', 300) // decline for 5 minutes
  }

  async getExistingCall(offer) {
    const key = this.getCallKey(this.subscriberEthAddress, offer)
    return await this.getRedis(key)
  }

  async sendCallRequest(ethAddress, offer, callId) {
    const {listingID, offerID} = offer
    const key = this.getCallKey(ethAddress, offer)

    const declined = await this.checkDeclined(ethAddress, offer)
    if (declined) {
      this.sendMsg({from:ethAddress, declined:{offer, callId}})
      return false
    }
    const existingCall = await this.getRedis(key)
    if (existingCall && existingCall != callId) {
      this.sendMsg({from:ethAddress, declined:{offer, callId, existingCall}})
      return false
    }

    const expKey = `exp.${this.subscriberEthAddress}.${callId}`
    const dateStr = await this.getRedis(expKey)

    if (!dateStr) {
      const countKey = CALL_COUNT_PREFIX + key
      const count = Number((await this.getRedis(countKey)))
      if (count > 3) {
        this.sendMsg({from:ethAddress, declined:{offer, callId, maxCalls:count}})
        return false
      }
      // this is a brand new call
      this.redis.incr(countKey)
      this.redis.expire(countKey, 1800)
      // clear incoming calls for me, since I'm expecting an answer from the caller
      this.redis.del(CALL_COUNT_PREFIX + this.getCallKey(this.subscriberEthAddress, offer))

      //This should be set to the correct time
      this.redis.set(expKey, new Date().toISOString(), 'EX', 24* 60 * 60) // call attempts last for a day
    } else if ((new Date() - new Date(dateStr)) > 35 * 1000) { // you can only ring someone for 35 seconds
      this.sendMsg({from:ethAddress, declined:{offer, callId, expired:true}})
      return false
    } 
    //clear the decline for the offer if I had any.
    this.clearDeclined(offer)

    this.logic.sendNotificationMessage(ethAddress, `${this.getName()} is calling you.`, {listingID, offerID, callId}, callId)
    this.redis.set(key, callId, 'EX', 5)
    setTimeout(() => {
      this.redis.get(key, (err, reply) => {
        if (reply != callId) {
          this.logic.sendNotificationMessage(ethAddress, `Missed chai call from ${this.getName()}`, {listingID, offerID, callId}, callId, true)
        }
      })
    }, 5500) //after six seconds if that value is still there well then it's probably ended
    return true
  }

  handleSubscribe({ethAddress, subscribe}) {
    if (subscribe)
    {
      (async () => {
        const {offer, accept} = subscribe
        if (offer) {
          const { listingID, offerID, transactionHash, blockNumber } = subscribe.offer
          const offer = await this.logic.getOffer(listingID, offerID, transactionHash, blockNumber)

          if (!subscribe.callId) {
            logger.info("Offer is:", offer)
          }
          const accepted = this.logic.isOfferAccepted(offer)

          // TODO: we need a price on this offer so need to load up profiles here as well
          if (offer && offer.active && !offer.rejected
            && offer.from == this.subscriberEthAddress && (!offer.to || offer.to == ethAddress) &&
            (web3.utils.toBN(offer.contractOffer.totalValue).gte(this.getMinCost) || accepted))
          {
            if (subscribe.callId && accepted) {
              // you can only call into accepted offers
              //
              if (!(await this.sendCallRequest(ethAddress, {listingID, offerID}, subscribe.callId))) {
                // couldn't call for some reason
                return
              }
              offer.lastNotify = new Date()
            } else if (!offer.lastNotify || (new Date() - offer.lastNotify) > 1000 * 60* 60 && !accepted) {
              this.logic.sendNotificationMessage(ethAddress, `You have received an offer to talk for ${offer.amount} ETH from ${this.getName()}.`, {listingID, offerID})
              offer.lastNotify = new Date()
            } else {
              console.log("Limit for sending offers sent.")
              return
            }
            offer.fromNewMsg = false
            offer.toNewMsg = true
            offer.save()

            this.decorateOffer(subscribe.offer, offer)
            subscribe.turn = this.getTurn(ethAddress, offer)

            // this is a good offer
            this.publish(CHANNEL_PREFIX + ethAddress, {from:this.subscriberEthAddress, subscribe})
            if (transactionHash) {
              this.sendOffer(offer)
            }
          }
        } else if (accept) {
          const {
            listingID,
            offerID,
            transactionHash
          } = subscribe.accept
          const offer = await this.logic.getOffer(listingID, offerID)

          if (offer && offer.active
            && (offer.to == this.subscriberEthAddress || !offer.to) && offer.from == ethAddress
            && this.logic.isOfferAccepted(offer))
          {
            if (transactionHash) {
              this.logic.sendNotificationMessage(ethAddress, `${this.getName()} has accepted your invitation to talk.`, {listingID, offerID})
            }

            if (subscribe.callId) {
              // you can only call into accepted offers
              if (!(await this.sendCallRequest(ethAddress, {listingID, offerID}, subscribe.callId))) {
                // couldn't call for some reason
                return
              }
              offer.lastFromNotify = new Date()
            } else {
              console.log("Call id required for accept.")
              return
            }

            //we already read this offer
            offer.fromNewMsg = true
            offer.toNewMsg = false
            offer.save()

            //if we have a voucher from before send it
            this.decorateOffer(subscribe.accept, offer)
            subscribe.turn = this.getTurn(ethAddress, offer)

            this.publish(CHANNEL_PREFIX + ethAddress, {from:this.subscriberEthAddress, subscribe})
            if (transactionHash) {
              this.sendOffer(offer)
            }
          }
        }
      }) ()
      return true
    }
  }

  handleReject({reject}) {
    if (reject) {
      (async () => {
        const {listingID, offerID} = reject.offer
        const offer = await this.logic.getDbOffer(listingID, offerID)
        if (!offer.active)
        {
          //do nothing
          return
        }

        if (offer.to == this.subscriberEthAddress)
        {
          if (offer.lastVoucher || this.logic.isOfferAccepted(offer))
          {
            offer.toNewMsg = false
            this.setDeclined(offer)
          } else {
            offer.rejected = true
            this.publish(CHANNEL_PREFIX + offer.from, {from:this.subscriberEthAddress, rejected:{offer: {listingID, offerID}}})
            this.logic.sendNotificationMessage(offer.from, `Your offer to ${this.getName()} has been declined.`, {listingID, offerID})
          }
          await offer.save()
        } 
        else if (offer.from == this.subscriberEthAddress)
        {
          offer.fromNewMsg = false
          await offer.save()
          this.setDeclined(offer)
        }
      })()
      return true
    }
  }


  handleCollected({collected}) {
    if (collected) {
      (async () => {
        const {listingID, offerID} = collected.offer
        const offer = await this.logic.getOffer(listingID, offerID)
        console.log("collecting offer:", offer)

        if (!offer.active && offer.to == this.subscriberEthAddress)
        {
          this.publish(CHANNEL_PREFIX + offer.from, {from:this.subscriberEthAddress, collected:{offer:{listingID, offerID}}})
        }
      })()
      return true
    }
  }

  handleDismiss({dismiss}) {
    if (dismiss) {
      (async () => {
        const {listingID, offerID} = dismiss.offer
        const offer = await this.logic.getDbOffer(listingID, offerID)

        if (offer.active && offer.from == this.subscriberEthAddress)
        {
          offer.dismissed = true
          await offer.save()
        }
      })()
      return true
    }
  }

  handleRead({read}) {
    if(read) {
      (async () => {
        const {listingID, offerID} = read.offer
        const offer = await this.logic.getDbOffer(listingID, offerID)

        if (offer.active)
        {
          if (offer.from == this.subscriberEthAddress)
          {
            offer.fromNewMsg = false
            await offer.save()
          } else if (offer.to == this.subscriberEthAddress) {
            offer.toNewMsg = false
            await offer.save()
          }
        }
          
      })()
      return true
    }
  }

  handleStartSession({startSession}) {
    if(startSession) {
      (async () => {
        const {listingID, offerID} = startSession.offer
        const offer = await this.logic.getDbOffer(listingID, offerID)
        if(offer.from == this.subscriberEthAddress && 
          offer.active && this.logic.isOfferAccepted(offer) && offer.fromNewMsg) {
          await offer.update({toNewMsg:true}) // let the other guy know we've started as well, this should both be now true
        }
      })()
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
        logger.info("Trying to subscribe to self:", ethAddress)
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
        if(await this.logic.updateIncreasingVoucher(ethAddress, voucher)) {
          this.publish(CHANNEL_PREFIX + ethAddress, {from:this.subscriberEthAddress, voucher})
        }
      })()
      return true
    }
  }

  handleGetOffers({getOffers}) {
    if (getOffers) {
      const options = getOffers
      this.getPendingOffers(options)
      return true
    }
  }

  async getPendingOffers(options) {
    const pendingOffers = await this.logic.getOffers(this.subscriberEthAddress, options)
    await Promise.all(pendingOffers.map(async o => {  
      if (await this.getExistingCall(o)) {
        o.incomingCall = true
      }
    }))
    this.sendMsg({pendingOffers})
  }


  clientMessage(msgObj) {
    logger.info("We have a message from the client:", msgObj)
    for (const handler of this.incomingMsgHandlers) {
      if (handler.call(this, msgObj) ) {
        return
      }
    }
  }

  async clientClose() {
    for (const peer of this.peers) {
      this.removePeer(peer)
    }
    this.redisSub.removeAllListeners()
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
    logger.info("call subscribing...", ethAddress)
    if (message && !(message.includes(rules.join(",")) && message.includes(timestamp))) {
      throw new Error("Invalid subscription message sent")
    }

    if (walletToken && !message.includes(walletToken)) {
      throw new Error("Signature message does not include the wallet token")
    }

    const currentDate = new Date()
    const tsDate = new Date(timestamp)
    logger.info("subscribing...", ethAddress)
    const recovered = web3.eth.accounts.recover(message, authSignature)
    // we keep thje signature fresh for every 15 days
    if (ethAddress == recovered && currentDate - tsDate < 15 * 24 * 60 * 60 * 1000)
    {
      if (rules.includes("VIDEO_MESSAGE"))
      {
        logger.info("Authorized connection for:", ethAddress)
        return new WebrtcSub(ethAddress, this.redis, this.redis.duplicate(), this.activeAddresses, this, walletToken)
      }
    }
    logger.error("signature mismatch:", recovered, " vs ", ethAddress)
    throw new Error(`We cannot auth the signature`)
  }

  async getActiveAddresses() {
    const onlineActives = Object.keys(this.activeAddresses)
    const activeNotifcations = await db.WebrtcNotificationEndpoint.findAll({ where: { active:true }, order:[['lastOnline', 'DESC']] })

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
      logger.info("submitting ipfsHash:", ipfsHash)
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
      try {
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
              if(attested.info) {
                attest.info = attested.info
              }
            }
          }
        }
        info.attests = attests.filter(a => a.verified)
      } catch (error) {
        console.log("ERROR verifying attests:", error)
        info.attests = []
      }
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

  async registerReferral(ethAddress, attestUrl, referralUrl, res) {
    const a = new URL(attestUrl)
    const paths = a.pathname.split("/")
    const query = querystring.parse(a.search.substring(1))
    let passedAddress = query.p
    if (paths[paths.length -2] == 'profile' || paths[paths.length -2] == 'p'){
      passedAddress = paths[paths.length -1]
    }
    if (!(passedAddress == ethAddress && "attest" in query))
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
        //update the stats
        const info = await extractAccountStat(attested.accountUrl)
        if (info)
        {
          attested.update({info})
        }
        await db.InboundAttest.upsert({attestedSiteId:attested.id, ethAddress, url:referralUrl, verified:true, sanitizedUrl})
        res.status = 200
        res.json({ site, account, accountUrl, links:[sanitizedUrl] })
        return
      }
    } else if (inbound && inbound.verified) {
      const attested = await db.AttestedSite.findByPk(inbound.attestedSiteId)
      if (attested) {
        //update the stats
        const info = await extractAccountStat(attested.accountUrl)
        if (info)
        {
          attested.update({info})
        }
        const {site, account, accountUrl, verified} = attested
        res.json({ site, account, accountUrl, links:[inbound.sanitizedUrl] })
        return
      } else {
        throw new AttestationError('Can not find Attestation Site')
      }
    }

    throw new Error("What is up yo?")
    return {}
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

    if(offer.active && this.isOfferAccepted(offer) && offer.to == ethAddress && fee =='0'){
      const BNpayout = web3.utils.toBN(payout)
      if (web3.utils.toBN(offer.contractOffer.totalValue).lt(BNpayout)) {
        //payout too large
        return
      }
      voucher.escrowedAmount = offer.contractOffer.totalValue
      if (offer.lastVoucher) {
        if (web3.utils.toBN(offer.lastVoucher.payout).gte(BNpayout))
        {
          return
        }
      }
      const recoveredAddress = await this.hot.recoverFinalize(listingID, offerID, ipfsHash, payout, fee, signature)
      if (recoveredAddress == offer.contractOffer.verifier)
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

  async getDbOffer(listingID, offerID) {
    const fullId = getFullId(listingID, offerID)
    return await db.WebrtcOffer.findOne({ where: {fullId}})
  }

  async getOffer(listingID, offerID, transactionHash, blockNumber, _dbOffer) {
    const fullId = getFullId(listingID, offerID)
    const contractOffer = filterObject(await this.contract.methods.offers(listingID, offerID).call())
    const dbOffer = _dbOffer || await db.WebrtcOffer.findOne({ where: {fullId}})

    if (!contractOffer || (contractOffer.status == '0' && contractOffer.buyer == emptyAddress)){
      if (!dbOffer){
        return null
      }

      if (!dbOffer.active)
      {
        return dbOffer
      }

      dbOffer.active = false
      await dbOffer.save()
      return dbOffer
    }

    contractOffer.totalValue = web3.utils.toBN(contractOffer.value).sub(web3.utils.toBN(contractOffer.refund)).toString()

    if (dbOffer && _.isEqual(contractOffer, dbOffer.contractOffer) && !(transactionHash && blockNumber))
    {
      return dbOffer
    }

    const intStatus = Number(contractOffer.status)

    let to = contractOffer.seller
    if (to == emptyAddress) {
      to = undefined
    }

    const from = contractOffer.buyer

    // grab info if available...
    let initInfo
    if (transactionHash && blockNumber) {
      logger.info("grabbing event from:", transactionHash, blockNumber, contractOffer.buyer, listingID, offerID)
      await new Promise((resolve, reject) => {
        this.contract.getPastEvents('OfferCreated', {
          filter: {party:contractOffer.buyer, listingID, offerID},
          fromBlock:blockNumber,
          toBlock:blockNumber
        }, (error, events) => {
          if (events.length > 0 )
          {
            const event = events[0]
            logger.info("event retreived:", event, error)
            if (event && event.transactionHash == transactionHash) {
              const offerCreated = filterObject(event.returnValues)
              initInfo = {offerCreated, transactionHash, blockNumber}
              logger.info("initInfo:", initInfo)
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


    const offer = {
      from,
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

  async sendNotificationMessage(ethAddress, msg, data, collapseId, silent) {
    const notifees = await db.WebrtcNotificationEndpoint.findAll({ where: { ethAddress, active:true } })
    for (const notify of notifees) {
      try {
        this.linker.sendNotify(notify, msg, data, collapseId, silent)
      } catch (error) {
        logger.info("Error sending notification:", notify, error)
      }
    }
  }

  async getEthToUsdRate() {
    const KEY = "ethcam.ETHtoUSD"
    let rate = await new Promise((resolve, reject) => {
      this.redis.get(KEY, (err, res)=> {
        if (err) {
          resolve(null)
        }
        resolve(res)
      })
    })

    if (rate) {
      return Number(rate)
    }

    rate = await getEthToUSDRate()

    this.redis.set(KEY, rate.toString(), 'EX', 30);
    return rate
  }

  isOfferAccepted(offer) {
    return Number(offer.contractOffer.status) == 2
  }

  async getDisplayOffer(listingID, offerID) {
    const offer = await this.getOffer(listingID, offerID)
    return offer.get({plain:true})
  }

  async getOffers(ethAddress, options) {
    const {ignoreBlockchain} = options

    const offers = await db.WebrtcOffer.findAll({where: {
      active:true,
      [db.Sequelize.Op.or]: [ {to:ethAddress}, {from:ethAddress} ] }})

    if (ignoreBlockchain) {
      return offers.map(o => o.get({plain:true}))
    } else {
      const updatedOffers = await Promise.all(offers.map(o => {
        const {listingID, offerID} = splitFullId(o.fullId)
        return this.getOffer(listingID, offerID, undefined, undefined, o)
      }))

      return updatedOffers.map(o=> o.get({plain:true}))
    }
  }

  getIpfsUrl(hash) {
    return `${this.linker.getIpfsGateway()}/ipfs/${hash}`
  }

  async getPage(accountAddress) {
    const BUNDLE_PATH = process.env.BUNDLE_PATH || "/"
    const keywords = "video, chat, ethereum, facetoface"
    if (accountAddress && accountAddress.startsWith("0x"))
    {
      const rate = await this.getEthToUsdRate()
      const account = await this.getUserInfo(accountAddress)

      const minUsdCost = Number(account.minCost) * rate
      const title = account.name || accountAddress + ` is available for a chai for ${account.minCost} ETH($${minUsdCost})`
      const description = account.description || ""
      const url = this.linker.getDappUrl() + "?p=" + accountAddress
      const imageUrl = account.icon && this.getIpfsUrl(account.icon)

      // map in the iconSource
      if( imageUrl ) {
        account.iconSource = {uri:imageUrl}
      }
      account.minUsdCost = minUsdCost
      return createHtml({title, description, url, imageUrl}, {account}, BUNDLE_PATH)
    } else {
      const title = "How much is a shared moment worth?"
      const description = "Pay to share a moment with those that your admire most."
      const url = this.linker.getDappUrl() 
      const imageUrl = null
      return createHtml({title, description, url, imageUrl}, {index:true}, BUNDLE_PATH)
    }
  }
}
