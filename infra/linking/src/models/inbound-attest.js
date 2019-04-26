'use strict'
module.exports = (sequelize, DataTypes) => {
  const InboundAttest = sequelize.define(
    'InboundAttest',
    {
      attestedSiteId: DataTypes.INTEGER,
      url:DataTypes.STRING,
      ethAddress: DataTypes.STRING(64),
      verified: DataTypes.BOOLEAN,
      sanitizedUrl:DataTypes.STRING,
      info:DataTypes.JSON
    },
    {
      tableName: 'inbound_attest'
    }
  )
  InboundAttest.associate = function(models) {
    // associations can be defined here
    InboundAttest.belongsTo(models.AttestedSite)
  }
  return InboundAttest
}
