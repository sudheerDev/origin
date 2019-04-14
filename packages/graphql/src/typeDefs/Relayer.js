module.exports = `
  extend type Mutation {
    createListingWithProxy(sign: String!, signer: String!, txData: String!): CreateListingWithProxyResult!
    storeToIPFS(
      from: String!
      deposit: String
      depositManager: String
      data: ListingInput!
      unitData: UnitListingInput
      fractionalData: FractionalListingInput
    ): StoreToIPFSResult!
  }

  type CreateListingWithProxyResult {
    success: Boolean
    reason: String
    data: String
  }

  type StoreToIPFSResult {
    ipfsHash: String!
    txData: String!
    dataToSign: String!
  }
`