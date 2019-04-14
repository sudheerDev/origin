import gql from 'graphql-tag'

export default gql`
  mutation CreateListingWithProxy(
    $sign: String!
    $signer: String!
    $txData: String!
  ) {
    createListingWithProxy(sign: $sign, signer: $signer, txData: $txData) {
      success
      reason
      data
    }
  }
`
