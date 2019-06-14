import Webrtc from './src/logic/webrtc'
import db from './src/models/'

const webrtc = new Webrtc()
async function updateAllRanks() {
  let count = 0
  const users = await db.UserInfo.findAll()

  for (const user of users) {
    if (!user.banned && user.info) {
      const rank = await webrtc.getRank(user.ethAddress, user.info)
      await user.update({rank})
      console.log(`setting rank:${rank} for ethAddress: ${user.ethAddress}`)
      count += 1
    }
  }
  return count
}

updateAllRanks().then(count => {
  console.log(`updated ${count}`)
})
