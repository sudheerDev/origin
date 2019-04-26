'use strict';
module.exports = (sequelize, DataTypes) => {
  const UserInfo = sequelize.define('UserInfo', {
    ethAddress: { type:DataTypes.STRING, primaryKey:true },
    info: DataTypes.JSON,
    ipfsHash: DataTypes.STRING(64)
  }, {
    tableName: 'user_info'
  });
  UserInfo.associate = function(models) {
    // associations can be defined here

  };
  return UserInfo;
};
