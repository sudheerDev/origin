import Origin from '@origin/js'
import Web3 from 'web3'
import logger from 'logger'

const providerUrl = process.env.PROVIDER_URL
const discoveryServerUrl = process.env.DISCOVERY_SERVER_URL
const perfModeEnabled = process.env.ENABLE_PERFORMANCE_MODE === 'true'
const web3 = new Web3(new Web3.providers.HttpProvider(providerUrl, 20000))

const originConfig = {
  ipfsDomain: process.env.IPFS_DOMAIN,
  ipfsApiPort: process.env.IPFS_API_PORT,
  ipfsGatewayPort: process.env.IPFS_GATEWAY_PORT,
  ipfsGatewayProtocol: process.env.IPFS_GATEWAY_PROTOCOL,
  web3,
  perfModeEnabled,
  discoveryServerUrl
}

const originConfigWithoutWeb3 = {...originConfig}
delete originConfigWithoutWeb3.web3

logger.info(`Initialising origin-js with config: `, originConfigWithoutWeb3)
const origin = new Origin(originConfig)

export default origin
export { providerUrl, perfModeEnabled, discoveryServerUrl, web3 }
