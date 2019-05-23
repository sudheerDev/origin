import md5 from 'md5'
import saslprep from 'saslprep'
import _redis from 'redis'

//require TURN vars
const _key = process.env.TURN_KEY
const _prefix = process.env.TURN_PREFIX
const redis_url = process.env.TURN_REDIS_URL
const realm = process.env.TURN_REALM
const redis = redis_url && _redis.createClient(redis_url)

function generateCredential(_user, _realm, _pass) {
  return md5(`${_user}:${_realm}:${saslprep(_pass)}`)
}

export function setTurnCred(user, pass) {
  const cred = generateCredential(user, realm, pass)
  redis.set(`turn/realm/${realm}/user/${user}/key`, cred, 'EX', 900) //set for 15 minutes
}

