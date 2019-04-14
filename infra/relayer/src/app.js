'use strict'

const express = require('express')
const app = express()
const cors = require('cors')
const session = require('express-session')
const bodyParser = require('body-parser')

const _session = {
  name: process.env.COOKIE_NAME || 'origin-relayer',
  secret: process.env.SESSION_SECRET || 'secret',
  resave: true,
  saveUninitialized: true,
  cookie: {
    secure: app.get('env') === 'production',
    maxAge: 60000
  }
}

app.use(session(_session))
app.use(express.json())
app.use(cors({ origin: true, credentials: true }))
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))

app.use(require('./controllers'))

app.listen(5100, () => {
  console.log(`Relayer listening on port 5100...`)
})

module.exports = app
