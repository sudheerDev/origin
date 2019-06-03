import express from 'express'
import expressWs from 'express-ws'
import Linker from './logic/linker'
// TODO: uncomment
import Hot from './logic/hot'
import Webrtc from './logic/webrtc'
import logger from 'logger'
import AttestationError from 'utils/attestation-error'

const router = express.Router()
//doing this is a hack for detached routers...
expressWs(router)

const CLIENT_TOKEN_COOKIE = 'ct'
const NOTIFY_TOKEN = process.env.NOTIFY_TOKEN

const getClientToken = req => {
  return req.cookies[CLIENT_TOKEN_COOKIE]
}

const clientTokenHandler = (res, clientToken) => {
  if (clientToken) {
    res.cookie(CLIENT_TOKEN_COOKIE, clientToken, {
      expires: new Date(Date.now() + 15 * 24 * 3600 * 1000),
      httpOnly: true
    })
  }
}

const linker = new Linker()
const hot = new Hot()
const webrtc = new Webrtc(linker, hot)

router.post('/generate-code', async (req, res) => {
  try {
    const _clientToken = getClientToken(req)
    const {
      return_url,
      session_token,
      pub_key,
      pending_call,
      notify_wallet
    } = req.body
    const { clientToken, sessionToken, code, linked } = await linker.generateCode(
      _clientToken,
      session_token,
      pub_key,
      req.useragent,
      return_url,
      pending_call,
      notify_wallet
    )
    clientTokenHandler(res, clientToken)
    res.send({ session_token: sessionToken, link_code: code, linked })
  } catch (e) {
    logger.error('Internal server error: ', e.message)
    res.status(500).json({ message: 'Unexpected error has occurred' })
  }
})

router.get('/link-info/:code', async (req, res) => {
  try {
    const { code } = req.params
    // this is the context
    const { appInfo, linkId, pubKey } = await linker.getLinkInfo(code)
    res.send({ app_info: appInfo, link_id: linkId, pub_key: pubKey })
  } catch (e) {
    logger.error('Internal server error: ', e.message)
    res.status(500).json({ message: 'Unexpected error has occurred' })
  }
})

router.get('/server-info/:version?', (req, res) => {
  try {
    const { version } = req.params
    // this is the context
    const info = linker.getServerInfo(version)
    if (hot.account)
    {
      info.verifier = hot.account.address
    }
    res.send(info)
  } catch (e) {
    logger.error('Internal server error: ', e.message)
    res.status(500).json({ message: 'Unexpected error has occurred' })
  }
})

router.post('/call-wallet/:sessionToken', async (req, res) => {
  try {
    const clientToken = getClientToken(req)
    const { sessionToken } = req.params
    const { account, call_id, call, return_url } = req.body
    const success = await linker.callWallet(
      clientToken,
      sessionToken,
      account,
      call_id,
      call,
      return_url
    )
    res.send({ success })
  } catch (e) {
    logger.error('Internal server error: ', e.message)
    res.status(500).json({ message: 'Unexpected error has occurred' })
  }
})

router.post('/wallet-called/:walletToken', async (req, res) => {
  try {
    const { walletToken } = req.params
    const { call_id, link_id, session_token, result } = req.body
    const success = await linker.walletCalled(
      walletToken,
      call_id,
      link_id,
      session_token,
      result
    )
    res.send({ success })
  } catch (e) {
    logger.error('Internal server error: ', e.message)
    res.status(500).json({ message: 'Unexpected error has occurred' })
  }
})

router.post('/link-wallet/:walletToken', async (req, res) => {
  try {
    const { walletToken } = req.params
    const { code, current_rpc, current_accounts, priv_data } = req.body
    const {
      linked,
      pendingCallContext,
      appInfo,
      linkId,
      linkedAt
    } = await linker.linkWallet(
      walletToken,
      code,
      current_rpc,
      current_accounts,
      priv_data
    )

    res.send({
      linked,
      pending_call_context: pendingCallContext,
      app_info: appInfo,
      link_id: linkId,
      linked_at: linkedAt
    })
  } catch (e) {
    logger.error('Internal server error: ', e.message)
    res.status(500).json({ message: 'Unexpected error has occurred' })
  }
})

router.post('/prelink-wallet/:walletToken', async (req, res) => {
  try {
    const { walletToken } = req.params
    const { pub_key, current_rpc, current_accounts, priv_data } = req.body
    const { code, linkId } = await linker.prelinkWallet(
      walletToken,
      pub_key,
      current_rpc,
      current_accounts,
      priv_data
    )

    res.send({ code, link_id: linkId })
  } catch (e) {
    logger.error('Internal server error: ', e.message)
    res.status(500).json({ message: 'Unexpected error has occurred' })
  }
})

router.post('/link-prelinked', async (req, res) => {
  try {
    const { code, link_id, return_url } = req.body
    const { clientToken, sessionToken, linked } = await linker.linkPrelinked(
      code,
      link_id,
      req.useragent,
      return_url
    )

    clientTokenHandler(res, clientToken)
    res.send({ session_token: sessionToken, linked })
  } catch (e) {
    logger.error('Internal server error: ', e.message)
    res.status(500).json({ message: 'Unexpected error has occurred' })
  }
})

router.get('/wallet-links/:walletToken', async (req, res) => {
  try {
    const { walletToken } = req.params
    const links = await linker.getWalletLinks(walletToken)
    res.send(links)
  } catch (e) {
    logger.error('Internal server error: ', e.message)
    res.status(500).json({ message: 'Unexpected error has occurred' })
  }
})

router.post('/wallet-update-links/:walletToken', async (req, res) => {
  try {
    const { walletToken } = req.params
    const { updates } = req.body
    const update_count = await linker.updateWalletLinks(walletToken, updates)
    res.send({ update_count })
  } catch (e) {
    logger.error('Internal server error: ', e.message)
    res.status(500).json({ message: 'Unexpected error has occurred' })
  }
})

router.post('/eth-notify', async (req, res) => {
  try {
    const { receivers, token } = req.body
    if (token == NOTIFY_TOKEN) {
      linker.ethNotify(receivers)
    }
    res.send(true)
  } catch (e) {
    logger.error('Internal server error: ', e.message)
    res.status(500).json({ message: 'Unexpected error has occurred' })
  }
})

router.post('/unlink', async (req, res) => {
  try {
    const clientToken = getClientToken(req)
    const success = await linker.unlink(clientToken)
    res.send(success)
  } catch (e) {
    logger.error('Internal server error: ', e.message)
    res.status(500).json({ message: 'Unexpected error has occurred' })
  }
})

router.post('/unlink-wallet/:walletToken', async (req, res) => {
  try {
    const { walletToken } = req.params
    const { link_id } = req.body
    const success = await linker.unlinkWallet(walletToken, link_id)
    res.send(success)
  } catch (e) {
    logger.error('Internal server error: ', e.message)
    res.status(500).json({ message: 'Unexpected error has occurred' })
  }
})

router.post('/register-wallet-notification/:walletToken', async (req, res) => {
  try {
    const { walletToken } = req.params
    const { eth_address, device_type, device_token } = req.body
    const success = await linker.registerWalletNotification(
      walletToken,
      eth_address,
      device_type,
      device_token
    )
    res.send(success)
  } catch (e) {
    logger.error('Internal server error: ', e.message)
    res.status(500).json({ message: 'Unexpected error has occurred' })
  }
})

router.ws('/linked-messages/:sessionToken/:readId', async (ws, req) => {
  try {
    const clientToken = getClientToken(req)
    const { sessionToken, readId } = req.params
    //filter out sessionToken
    const realSessionToken = ['-', 'null', 'undefined'].includes(sessionToken)
      ? null
      : sessionToken

    logger.info(
      `Messages link sessionToken:${sessionToken} clientToken:${clientToken} readId:${readId}`
    )

    if (!clientToken) {
      ws.close(1000, 'No client token available.')
      return
    }
    //this prequeues some messages before establishing the connection
    const closeHandler = await linker.handleSessionMessages(
      clientToken,
      realSessionToken,
      readId,
      (msg, msgId) => {
        ws.send(JSON.stringify({ msg, msgId }))
      }
    )
    ws.on('close', () => {
      closeHandler()
    })
  } catch (error) {
    logger.info('we encountered an error:', error)
    ws.close(1000, error)
  }
})

router.ws('/webrtc-relay/:ethAddress', (ws, req) => {
  const { ethAddress } = req.params
  logger.info(
    `Webrtc relay opened for:${ethAddress}`
  )

  if (!ethAddress) {
    ws.close()
  }

  ws.on('message', msg => {
    logger.info("we got a message for:", msg)
    const { signature, message, rules, timestamp, walletToken } = JSON.parse(msg)

    try {
      const sub = webrtc.subscribe(ethAddress, signature, message, rules, timestamp, walletToken)

      sub.onServerMessage(msg => {
        ws.send(msg)
      })

      ws.removeAllListeners("message") //clear out the auth handler
      ws.on('message', msg => {
        sub.clientMessage(JSON.parse(msg))
      })

      ws.on('close', () => {
        logger.info("closing connection...")
        sub.clientClose()
      })
    } catch(error) {
      logger.error(error)
      ws.close(1000, 'Client auth error.')
    }
  })

})

router.get('/webrtc-addresses', async (req, res) => {
  try {
    const actives = await webrtc.getActiveAddresses()
    res.send(actives)
  } catch (e) {
    logger.error('Internal server error: ', e.message)
    res.status(500).json({ message: 'Unexpected error has occurred' })
  }
})

router.post('/webrtc-flag/:address', async (req, res) => {
  const { address } = req.params
  const {flagger, reason, timestamp, signature} = req.body
  try {
    await webrtc.flagAddress(address, flagger, reason, timestamp, signature)
    res.send({flagged:1})
  } catch (e) {
    logger.error('Internal server error: ', e)
    res.status(500).json({ message: 'Unexpected error has occurred' })
  }
})

router.get('/webrtc-offer/:listingID/:offerID', async (req, res) => {
  try {
    const {listingID, offerID} = req.params
    const offer = await webrtc.getOffer(listingID, offerID)

    if (offer) {
      res.send(offer.get({plain:true}))
    } else {
      res.send({})
    }
  } catch (e) {
    logger.error('Internal server error: ', e.message)
    res.status(500).json({ message: 'Unexpected error has occurred' })
  }
})

router.post('/wr-reg-ref/:accountAddress', async (req, res) => {
  try {
    const {accountAddress} = req.params
    const {attestUrl, referralUrl} = req.body
    await webrtc.registerReferral(accountAddress, attestUrl, referralUrl, res)
  } catch (e) {
    if (e instanceof AttestationError) {
      logger.error('Attestation error: ', e.message)
      res.status(400).json({ message: e.message })  
    } else {
      logger.error('Internal server error: ', e.message)
      res.status(500).json({ message: 'Unexpected error has occurred' })
    }
  }
})

router.get('/webrtc-attests/:accountAddress', async (req, res) => {
  try {
    const {accountAddress} = req.params
    res.send(await webrtc.getAllAttests(accountAddress))
  } catch (e) {
    logger.error('Internal server error: ', e.message)
    res.status(500).json({ message: 'Unexpected error has occurred' })
  }
})

router.get('/webrtc-static/:pathAddress?', async (req, res) => {
  const { pathAddress } = req.params
  const accountAddress = req.query.p
  res.send(await webrtc.getPage(pathAddress||accountAddress))
})

router.get('linkedin-authed', async (req, res) => {
  const result = await webrtc.processLinkedinAuth(req.query)
  res.send(result)
})

router.post('/webrtc-user-info', async (req, res) => {
  try {
    const { ipfsHash } = req.body
    res.send(await webrtc.submitUserInfo(ipfsHash))
  } catch (e) {
    logger.error('Internal server error: ', e.message)
    res.status(500).json({ message: 'Unexpected error has occurred' })
  }
})

router.get('/webrtc-user-info/:accountAddress/:watcherAddress?', async (req, res) => {
  const {accountAddress, watcherAddress} = req.params

  try {
    const info = await webrtc.getUserInfo(accountAddress, watcherAddress)
    if (info) {
      res.send(info)
    } else {
      res.status(404).send({
        message: 'User not found'
      })
    }
  } catch (error) {
    logger.error("Error getting user info:", error)
    res.status(500).json({ message: 'Unexpected error has occurred' })
  }
})

router.post('/webrtc-verify-accept', async (req, res) => {
  const {ethAddress, ipfsHash, behalfFee, sig, listingID, offerID} = req.body

  const result = await webrtc.verifyAcceptOffer(ethAddress, ipfsHash, behalfFee, sig, listingID, offerID)
  res.send(result)
})

router.post('/webrtc-verify-finalize', async (req, res) => {
  const {listingID, offerID, ipfsHash, behalfFee, fee, payout, sellerSig, sig} = req.body

  const result = await webrtc.verifySubmitFinalize(listingID, offerID, ipfsHash, behalfFee, fee, payout, sellerSig, sig)
  res.send(result)
})


router.ws('/wallet-messages/:walletToken/:readId', (ws, req) => {
  const { walletToken, readId } = req.params

  logger.info(
    `Wallet messages link walletToken:${walletToken} readId:${readId}`
  )

  if (!walletToken) {
    ws.close()
  }

  const closeHandler = linker.handleMessages(
    walletToken,
    readId,
    (msg, msgId) => {
      ws.send(JSON.stringify({ msg, msgId }))
    }
  )
  ws.on('close', () => {
    closeHandler()
  })
})

router.post('/submit-marketplace-onbehalf', async (req, res) => {
  const { cmd, params } = req.body

  const result = await hot.submitMarketplace(cmd, params)
  res.send(result)
})

router.post('/verify-offer', async (req, res) => {
  const { offerId, params } = req.body
  const result = await hot.verifyOffer(offerId, params)
  res.send(result)
})


// For debugging one's dev environment
router.get('/marketplace-addresses', async (req, res) => {
  logger.info(req.params)
  const name = req.query.name || 'V00_Marketplace'
  const { contractAddresses } = linker.getServerInfo()
  try {
    const addresses = Object.entries(contractAddresses[name])
      .map(([networkId, entry]) => `network ${networkId}: ${entry.address}`)
      .join('\n')
    res.send(`Addresses for ${name}:\n${addresses}\n`)
  } catch (e) {
    logger.error(e)
    res.status(500).send(`Error getting address for contract ${name}\n`)
  }
})

export default router
