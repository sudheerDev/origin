import gql from 'graphql-tag'

export default gql`
  mutation StoreToIPFS(
    $from: String!
    $deposit: String
    $depositManager: String
    $data: ListingInput!
    $unitData: UnitListingInput
    $fractionalData: FractionalListingInput
  ) {
    storeToIPFS(
      from: $from
      deposit: $deposit
      depositManager: $depositManager
      data: $data
      unitData: $unitData
      fractionalData: $fractionalData
    ) {
      ipfsHash
      txData
      dataToSign
    }
  }
`
