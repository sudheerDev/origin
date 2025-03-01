'use strict'

const Logger = require('logplease')

Logger.setLogLevel(process.env.LOG_LEVEL || 'INFO')

module.exports = {
  log: Logger.create('event-listener', { showTimestamp: false }),
  Logger
}
