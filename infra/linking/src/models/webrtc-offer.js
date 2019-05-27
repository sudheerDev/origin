'use strict'

module.exports = (sequelize, DataTypes) => {
  const WebrtcOffer = sequelize.define(
    'WebrtcOffer',
    {
      fullId: {type:DataTypes.STRING(256), primaryKey:true},
      from: DataTypes.STRING(64),
      to: DataTypes.STRING(64),
      amount: DataTypes.DOUBLE,
      amountType: DataTypes.STRING(16),
      contractOffer: DataTypes.JSON,
      initInfo: DataTypes.JSON,
      lastVoucher: DataTypes.JSON,
      active: DataTypes.BOOLEAN,
      dismissed: DataTypes.BOOLEAN,
      rejected: DataTypes.BOOLEAN,
      fromNewMsg:DataTypes.BOOLEAN,
      toNewMsg:DataTypes.BOOLEAN,
      lastNotify:DataTypes.DATE,
      lastFromNotify:DataTypes.DATE
    },
    {
      tableName: 'webrtc_offer'
    }
  )
  WebrtcOffer.associate = function() {
    // associations can be defined here
  }
  return WebrtcOffer
}
