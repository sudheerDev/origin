import { post } from '@origin/ipfs'
import contracts from '../../contracts'
import { listingInputToIPFS } from '../marketplace/createListing';

/**
 * Stores the given listing to IPFS,
 * and returns IPFS hash and tx data
 */
async function storeToIPFS(_, input) {
  const { depositManager, data, unitData, fractionalData } = input
  const from = input.from || contracts.defaultLinkerAccount

  const ipfsData = listingInputToIPFS(data, unitData, fractionalData)
  const ipfsHash = await post(contracts.ipfsRPC, ipfsData)

  const deposit = contracts.web3.utils.toWei(String(input.deposit), 'ether')

  const txData = contracts.marketplaceExec.methods.createListing(
    ipfsHash,
    deposit,
    depositManager
  ).encodeABI()

  const dataToSign = web3.utils.soliditySha3(
    { t: 'address', v: from }, // Signer
    { t: 'address', v: contracts.marketplaceExec._address }, // Marketplace address
    { t: 'uint256', v: web3.utils.toWei('0', 'ether') }, // value
    { t: 'bytes', v: txData },
    // Should get nonce from DB
    { t: 'uint256', v: 0 } // nonce
  )

  return {
    ipfsHash,
    txData,
    dataToSign
  }
}

async function createListingWithProxy(_, { sign, signer, txData }) {
  const relayerServer = contracts.config.relayer

  const url = `${relayerServer}/relayer/listings`

  try {
    const response = await fetch(url, {
      headers: { 'content-type': 'application/json' },
      // credentials: 'include',
      method: 'POST',
      body: JSON.stringify({
        sign,
        signer,
        txData
      })
    })

    const data = await response.json()
  
    return {
      success: true,
      reason: null,
      data: JSON.stringify(data)
    }
  } catch (e) {
    return {
      success: false,
      reason: e.message
    }
  }

}

export { storeToIPFS }

export default createListingWithProxy