import Query from './Query'
import Subscription from './Subscription'
import Web3 from './Web3'
import Account from './Account'
import Marketplace from './Marketplace'
import Listing from './Listing'
import User from './User'
import Offer from './Offer'
import TokenHolder from './TokenHolder'
import Event from './Event'
import Token from './Token'
import IdentityEvents from './IdentityEvents'
import Conversation from './messaging/Conversation'
import Mutation from '../mutations/index'
import PromotionVerifications from './PromotionVerifications'

export default {
  Query,
  Mutation,
  Subscription,
  Web3,
  Event,
  Account,
  Marketplace,
  Listing,
  User,
  Offer,
  Token,
  TokenHolder,
  IdentityEvents,
  Conversation,
  ListingResult: {
    __resolveType(obj) {
      return obj.__typename
    }
  },
  CurrencyResult: {
    __resolveType(obj) {
      return obj.id.indexOf('fiat-') === 0 ? 'FiatCurrency' : 'Token'
    }
  },
  Currency: {
    __resolveType(obj) {
      return obj.id.indexOf('fiat-') === 0 ? 'FiatCurrency' : 'Token'
    }
  },
  PromotionVerifications
}
