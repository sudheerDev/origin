import redis from 'redis'
import origin, { web3 } from './../services/origin'
import db from './../models/'
import extractAttestInfo from './../utils/extract-attest'
import querystring from 'querystring'

const CHANNEL_PREFIX = "webrtc."
const CHANNEL_ALL = "webrtcall"

class WebrtcSub {
  constructor(ethAddress, redis, redisSub, activeAddresses) {
    redisSub.subscribe(CHANNEL_PREFIX + ethAddress)
    redisSub.subscribe(CHANNEL_ALL)
    this.activeAddresses = activeAddresses
    this.peers = []
    this.redis = redis
    this.redisSub = redisSub
    this.subscriberEthAddress = ethAddress

    this.activeAddresses[ethAddress] = 1 + (this.activeAddresses[ethAddress] || 0)

    this.redisSub.on("subscribe", (channel, count) => {
      if (channel == CHANNEL_ALL) {
        this.publish(CHANNEL_ALL, {from:this.subscriberEthAddress, join:1})
      }
    })
  }

  publish(channel, data) {
    this.redis.publish(channel, JSON.stringify(data))
  }

  onServerMessage(handler) {
    this.redisSub.on('message', (channel, msg) => {
      const {from, subscribe} = JSON.parse(msg)
      const offer = subscribe && subscribe.offer
      if (channel == CHANNEL_ALL || this.peers.includes(from) || offer)
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

  clientMessage(msgObj) {
    const {subscribe, ethAddress, exchange, leave} = msgObj
    if (subscribe) {
      const {offer, accept} = subscribe
      console.log("subscribe:", subscribe, ethAddress)
      if (offer) {
        this.addPeer(ethAddress)
        this.publish(CHANNEL_PREFIX + ethAddress, {from:this.subscriberEthAddress, subscribe})
      } else if (accept) {
        this.addPeer(ethAddress)
        this.publish(CHANNEL_PREFIX + ethAddress, {from:this.subscriberEthAddress, subscribe})
      }
    } else if (exchange) {
      if (ethAddress == this.subscriberEthAddress) {
        console.log("Trying to subscribe to self:", ethAddress)
        return
      }
      this.publish(CHANNEL_PREFIX + ethAddress, {from:this.subscriberEthAddress, exchange})
    } else if ( leave ) {
      this.removePeer(ethAddress)
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
  constructor() {
    this.redis = redis.createClient(process.env.REDIS_URL)
    this.activeAddresses = {}
  }

  subscribe(ethAddress, authSignature, message, rules, timestamp) {
    console.log("call subscribing...", ethAddress)
    if (!(message.includes(rules.join(",")) && message.includes(timestamp))) {
      throw new Error("Invalid subscription message sent")
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
        return new WebrtcSub(ethAddress, this.redis, this.redis.duplicate(), this.activeAddresses)
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
    if (userInfo) {
      return userInfo.info
    }
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
          attested = await db.AttestedSite.insert({ethAddress, site, account, accountUrl, verified:true})
        }
        await db.InboundAttested.upsert({attestedSiteId:attested.id, ethAddress, url:referralUrl, verified:true, sanitizedUrl})
      }
    }
  }
}
