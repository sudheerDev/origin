import fetch from 'cross-fetch'


export async function getEthToUSDRate() {
  const response = await fetch('https://min-api.cryptocompare.com/data/price?fsym=ETH&tsyms=USD')

  if (response.ok) {
    const result = await response.json()
    return result.USD
  }
}
