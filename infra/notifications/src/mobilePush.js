const Identity = require('../../identity/src/models').Identity

const { messageTemplates } = require('../templates/messageTemplates')

const apn = require('apn')
const firebase = require('firebase-admin')
const web3Utils = require('web3-utils')

const { getNotificationMessage } = require('./notification')
const logger = require('./logger')
const MobileRegistry = require('./models').MobileRegistry

const {
  getMessageFingerprint,
  isNotificationDupe,
  logNotificationSent
} = require('./dupeTools')

// Configure the APN provider
let apnProvider, apnBundle
if (process.env.APNS_KEY_FILE) {
  try {
    apnProvider = new apn.Provider({
      token: {
        key: process.env.APNS_KEY_FILE,
        keyId: process.env.APNS_KEY_ID,
        teamId: process.env.APNS_TEAM_ID
      },
      production: process.env.APNS_PRODUCTION === 'true' ? true : false
    })
    apnBundle = process.env.APNS_BUNDLE_ID
  } catch (error) {
    logger.error(`Error trying to configure apnProvider: ${error}`)
  }
} else {
  logger.warn('APN provider not configured.')
}

// Firebase Admin SDK
// ref: https://firebase.google.com/docs/reference/admin/node/admin.messaging
let firebaseMessaging
if (process.env.FIREBASE_SERVICE_JSON) {
  try {
    const firebaseServiceJson = require(process.env.FIREBASE_SERVICE_JSON)

    firebase.initializeApp({
      credential: firebase.credential.cert(firebaseServiceJson),
      databaseURL: process.env.FIREBASE_DB_URL
    })

    firebaseMessaging = firebase.messaging()
  } catch (error) {
    logger.error(`Error trying to configure firebaseMessaging: ${error}`)
  }
} else {
  logger.warn('Firebase messaging not configured.')
}

//
// Mobile Push notifications for Messages
//
async function messageMobilePush(receivers, sender, messageHash, config) {
  if (!receivers) throw new Error('receivers not defined')
  if (!sender) throw new Error('sender not defined')

  // Force lowercase
  sender = sender.toLowerCase()
  receivers = receivers.map(function(r) {
    return r.toLowerCase()
  })

  const payload = {
    url: `${config.dappUrl}/#/messages`
  }

  const senderIdentity = Identity.findOne({
    where: {
      ethAddress: sender
    }
  })

  receivers.forEach(async receiver => {
    try {
      const senderName =
        senderIdentity !== null &&
        senderIdentity.firstName &&
        senderIdentity.lastName
          ? `${senderIdentity.firstName || ''} ${senderIdentity.lastName ||
              ''} (${web3Utils.toChecksumAddress(sender)})`
          : web3Utils.toChecksumAddress(sender)

      const templateVars = {
        config,
        sender,
        senderName,
        dappUrl: config.dappUrl,
        ipfsGatewayUrl: config.ipfsGatewayUrl
      }

      const messageTemplate =
        messageTemplates.message['mobile']['messageReceived']
      // Apply template
      const message = {
        title: messageTemplate.title(templateVars),
        body: messageTemplate.body(templateVars)
      }
      const ethAddress = receiver
      const notificationObj = {
        message,
        payload
      }

      // Push the message
      const mobileRegister = await MobileRegistry.findOne({
        where: { ethAddress, deleted: false, 'permissions.alert': true }
      })
      if (mobileRegister) {
        logger.info(`Pushing message notification to ${ethAddress}`)
        await sendNotification(
          mobileRegister.deviceToken,
          mobileRegister.deviceType,
          notificationObj,
          ethAddress,
          messageHash,
          config
        )
      } else {
        logger.info(
          `Message: No device registered for notifications for ${ethAddress}`
        )
      }
    } catch (error) {
      logger.error(`Could not send push notification: ${error}`)
    }
  })
}

//
// Mobile Push notifications
//
async function transactionMobilePush(
  eventName,
  party,
  buyerAddress,
  sellerAddress,
  offer,
  listing,
  config
) {
  if (!eventName) throw new Error('eventName not defined')
  if (!party) throw new Error('party not defined')
  if (!buyerAddress) throw new Error('buyerAddress not defined')
  if (!sellerAddress) throw new Error('sellerAddress not defined')
  if (!offer) throw new Error('offer not defined')

  // Force lowercase
  buyerAddress = buyerAddress.toLowerCase()
  sellerAddress = sellerAddress.toLowerCase()
  party = party.toLowerCase()

  const receivers = {}
  const buyerMessageTemplate = getNotificationMessage(
    eventName,
    party,
    buyerAddress,
    'buyer',
    'mobile'
  )
  const sellerMessageTemplate = getNotificationMessage(
    eventName,
    party,
    sellerAddress,
    'seller',
    'mobile'
  )
  const payload = {
    url: offer && `${config.dappUrl}/#/purchases/${offer.id}`
  }

  const templateVars = {
    listing,
    offer,
    config,
    dappUrl: config.dappUrl,
    ipfsGatewayUrl: config.ipfsGatewayUrl
  }

  if (buyerMessageTemplate || sellerMessageTemplate) {
    if (buyerMessageTemplate) {
      receivers[buyerAddress] = {
        message: {
          title: buyerMessageTemplate.title(templateVars),
          body: buyerMessageTemplate.body(templateVars)
        },
        payload
      }
    }
    if (sellerMessageTemplate) {
      receivers[sellerAddress] = {
        message: {
          title: sellerMessageTemplate.title(templateVars),
          body: sellerMessageTemplate.body(templateVars)
        },
        payload
      }
    }

    for (const [_ethAddress, notificationObj] of Object.entries(receivers)) {
      const ethAddress = web3Utils.toChecksumAddress(_ethAddress)
      const mobileRegister = await MobileRegistry.findOne({
        where: {
          ethAddress: ethAddress.toLowerCase(),
          deleted: false,
          'permissions.alert': true
        }
      })
      if (mobileRegister) {
        logger.info(`Pushing transaction notification to ${ethAddress}`)
        await sendNotification(
          mobileRegister.deviceToken,
          mobileRegister.deviceType,
          notificationObj,
          ethAddress,
          null,
          config
        )
      } else {
        logger.info(
          `Transaction: No device registered for notifications for ${ethAddress}`
        )
      }
    }
  }
}

/* Send the notification depending on the type of notification (FCM or APN)
 *
 */
async function sendNotification(
  deviceToken,
  deviceType,
  notificationObj,
  ethAddress,
  messageHash,
  config
) {
  if (notificationObj) {
    const notificationObjAndHash = { ...notificationObj, messageHash }
    const messageFingerprint = getMessageFingerprint(notificationObjAndHash)
    if (deviceType === 'APN') {
      if (!apnProvider) {
        logger.error('APN provider not configured, notification failed')
        return
      }

      if ((await isNotificationDupe(messageFingerprint, config)) > 0) {
        logger.warn(`Duplicate. Notification already recently sent. Skipping.`)
        return
      }

      // iOS notifications
      const notification = new apn.Notification({
        alert: notificationObj.message,
        sound: 'default',
        payload: notificationObj.payload,
        topic: apnBundle
      })
      await apnProvider.send(notification, deviceToken).then(async result => {
        if (result.sent.length) {
          await logNotificationSent(
            messageFingerprint,
            ethAddress,
            'mobile-ios'
          )
          logger.debug('APN sent: ', result.sent.length)
        }
        if (result.failed) {
          logger.error('APN failed: ', result.failed)
        }
      })
    } else if (deviceType === 'FCM') {
      if (!firebaseMessaging) {
        logger.error('Firebase messaging not configured, notification failed')
        return
      }
      // FCM notifications
      // Message: https://firebase.google.com/docs/reference/admin/node/admin.messaging.Message
      const message = {
        android: {
          priority: 'high',
          notification: {
            channelId: 'Dapp'
          }
        },
        notification: {
          ...notificationObj.message
        },
        data: notificationObj.payload,
        token: deviceToken
      }

      await firebaseMessaging
        .send(message)
        .then(async response => {
          await logNotificationSent(
            messageFingerprint,
            ethAddress,
            'mobile-android'
          )
          logger.debug('FCM message sent:', response)
        })
        .catch(error => {
          logger.error('FCM message failed to send: ', error)
        })
    }
  }
}

module.exports = { transactionMobilePush, messageMobilePush }
