'use strict'

module.exports = (sequelize, DataTypes) => {
  const WebrtcNotificationEndpoint = sequelize.define(
    'WebrtcNotificationEndpoint',
    {
      ethAddress: DataTypes.STRING(255),
      walletToken: DataTypes.STRING(255),
      deviceToken: DataTypes.STRING(255),
      deviceType: DataTypes.STRING(16),
      active: DataTypes.BOOLEAN,
      lastOnline: DataTypes.DATE
    },
    {
      tableName: 'webrtc_notification_endpoint'
    }
  )
  WebrtcNotificationEndpoint.associate = function() {
    // associations can be defined here
  }
  return WebrtcNotificationEndpoint
}
