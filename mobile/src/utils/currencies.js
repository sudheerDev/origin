'use strict'

import * as RNLocalize from 'react-native-localize'
import get from 'lodash.get'

const IMAGES_PATH = '../../assets/images/'

export default {
  dai: {
    color: '#fec100',
    icon: require(`${IMAGES_PATH}dai-icon.png`),
    name: 'Maker Dai'
  },
  eth: {
    color: '#a27cff',
    icon: require(`${IMAGES_PATH}eth-icon.png`),
    name: 'Ethereum'
  },
  ogn: {
    color: '#007fff',
    icon: require(`${IMAGES_PATH}ogn-icon.png`),
    name: 'Origin Token'
  }
}

export function tokenBalanceFromGql(result, places = 0) {
  const web3 = global.web3

  const amount = get(result.data, 'web3.account.token.balance', 0)
  const amountBN = web3.utils.toBN(amount)
  const decimals = get(result.data, 'web3.account.token.token.decimals', 0)
  const decimalsBN = web3.utils.toBN(
    web3.utils.padRight('1', decimals + 1 - places)
  )
  const balance = amountBN.div(decimalsBN)
  if (places > 0) {
    return Number(balance / Math.pow(10, places))
  }
  return Number(balance)
}

export function findBestAvailableCurrency() {
  const supportedCurrencies = ['USD', 'GBP', 'KRW', 'CNY', 'EUR']
  const preferredCurrencies = RNLocalize.getCurrencies().filter(c =>
    supportedCurrencies.includes(c)
  )
  const currency = preferredCurrencies.length ? preferredCurrencies[0] : 'USD'
  return `fiat-${currency}`
}
