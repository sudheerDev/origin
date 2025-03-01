import React, { useState } from 'react'
import { Switch, Route } from 'react-router-dom'
import { fbt } from 'fbt-runtime'
import get from 'lodash/get'

import withWallet from 'hoc/withWallet'
import withCreatorConfig from 'hoc/withCreatorConfig'
import withIdentity from 'hoc/withIdentity'

import DocumentTitle from 'components/DocumentTitle'
import UserActivationLink from 'components/UserActivationLink'
import LoadingSpinner from 'components/LoadingSpinner'

import listingTypes from './listing-types'
import ChooseListingType from './ChooseListingType'
import ChooseCategory from './ChooseCategory'

import Store from 'utils/store'
const store = Store('sessionStorage')

function initialState(props) {
  // If a listing is passed in (as when editing) use that, otherwise
  // fall back to anything in `store` (an unfinished listing creation)
  const existingListing = props.listing || store.get('create-listing') || {}

  return {
    __typename: 'UnitListing', // Default
    title: '',
    description: '',
    category: '',
    subCategory: '',
    location: '',
    boost: '0',
    boostLimit: '0',
    media: [],

    // Unit fields:
    quantity: '1',
    price: '',
    currency: 'fiat-USD',
    acceptedTokens: ['token-DAI'],

    // Fractional fields:
    timeZone: '',
    workingHours: [],
    weekendPrice: '',
    booked: [],
    customPricing: [],
    unavailable: [],

    // Gift Card fields:
    retailer: '',
    cardAmount: '',
    issuingCountry: 'US',
    isDigital: false,
    isCashPurchase: false,
    receiptAvailable: false,

    // Marketplace creator fields:
    marketplacePublisher: get(props, 'creatorConfig.marketplacePublisher'),

    ...existingListing
  }
}

const CreateListing = props => {
  const [listing, setListing] = useState(initialState(props))

  if (
    props.creatorConfigLoading ||
    props.walletLoading ||
    props.identityLoading
  ) {
    return <LoadingSpinner />
  }

  if (!props.identity) {
    return (
      <UserActivationLink
        location={{ pathname: '/create' }}
        forceRedirect={true}
      />
    )
  }

  // Force a given listing type/category
  // Hack: '__' is not allowed in GraphQL where we get our config from, so we change
  // `typename` into `__typename` here.
  const forceType =
    props.creatorConfig && props.creatorConfig.forceType
      ? {
          ...props.creatorConfig.forceType,
          __typename: props.creatorConfig.forceType.typename
        }
      : {}

  const cmpProps = {
    listing: { ...listing, ...forceType },
    onChange: listing => {
      setListing(listing)
      store.set('create-listing', listing)
    }
  }

  // Get creation component for listing type (__typename),
  // defaulting to UnitListing
  const listingType = listing.__typename || 'UnitListing'
  const ListingTypeComponent = listingTypes[listingType]

  return (
    <div className="container create-listing">
      <DocumentTitle
        pageTitle={<fbt desc="createListing.title">Add A Listing</fbt>}
      />
      <Switch>
        <Route
          path="/create/details"
          render={() => (
            <ListingTypeComponent linkPrefix="/create/details" {...cmpProps} />
          )}
        />
        <Route
          path="/listing/:listingId/edit/:step"
          render={({ match }) => (
            <ListingTypeComponent
              linkPrefix={`/listing/${match.params.listingId}/edit/details`}
              refetch={props.refetch}
              {...cmpProps}
            />
          )}
        />
        <Route
          path="/listing/:listingId/edit"
          render={({ match }) => (
            <ChooseListingType
              next={`/listing/${match.params.listingId}/edit/details`}
              {...cmpProps}
            />
          )}
        />
        <Route
          path="/create/listing-type"
          render={() => (
            <ChooseCategory
              prev="/create"
              next="/create/details"
              {...cmpProps}
            />
          )}
        />
        <Route
          path="/create"
          render={() => (
            <ChooseListingType next="/create/listing-type" {...cmpProps} />
          )}
        />
      </Switch>
    </div>
  )
}

export default withCreatorConfig(withWallet(withIdentity(CreateListing)))

require('react-styl')(`
  .create-listing
    padding-top: 3rem
    .gray-box
      border-radius: var(--default-radius)
      padding: 2rem
      background-color: var(--pale-grey-eight)

    .step-description
      font-size: 18px
      font-weight: 300
      line-height: normal
      margin-bottom: 2.5rem

    .with-symbol
      position: relative

  @media (max-width: 767.98px)
    .create-listing
      padding-top: 1rem
      .step-description
        font-size: 16px
        margin-top: 2rem
        margin-bottom: 2rem
        text-align: center

`)
