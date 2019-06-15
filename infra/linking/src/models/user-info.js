'use strict';
module.exports = (sequelize, DataTypes) => {
  const UserInfo = sequelize.define('UserInfo', {
    ethAddress: { type:DataTypes.STRING, primaryKey:true },
    info: DataTypes.JSON,
    ipfsHash: DataTypes.STRING(64),
    flags: DataTypes.INTEGER,
    banned: DataTypes.BOOLEAN,
    hidden: DataTypes.BOOLEAN,
    rank: DataTypes.INTEGER
  }, {
    tableName: 'user_info'
  });
  UserInfo.associate = function(models) {
    // associations can be defined here
    UserInfo.hasMany(models.WebrtcNotificationEndpoint,
      { foreignKey: 'ethAddress', sourceKey:'ethAddress' })
  };
  return UserInfo;
};
