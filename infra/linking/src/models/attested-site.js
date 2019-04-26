'use strict';
module.exports = (sequelize, DataTypes) => {
  const AttestedSite = sequelize.define('AttestedSite', {
    ethAddress: DataTypes.STRING(64),
    site: DataTypes.STRING(32),
    account: DataTypes.STRING,
    accountUrl: DataTypes.STRING,
    info:DataTypes.JSON,
    verified: DataTypes.BOOLEAN,
    public: DataTypes.BOOLEAN
  }, {
    tableName: 'attested_site'
  });
  AttestedSite.associate = function(models) {
    // associations can be defined here
  };
  return AttestedSite;
};
