'use strict';
const TableName = 'attested_site'
module.exports = {
  up: (queryInterface, Sequelize) => {
    return queryInterface.createTable(TableName, {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      eth_address: {
        type: Sequelize.STRING
      },
      account_url: {
        type: Sequelize.STRING
      },
      site: {
        type: Sequelize.STRING(32)
      },
      account: {
        type: Sequelize.STRING
      },
      site_info : {
        type: Sequelize.JSON
      },
      info: {
        type: Sequelize.JSON
      },
      verified: {
        type: Sequelize.BOOLEAN,
        default: false
      },
      public: {
        type: Sequelize.BOOLEAN,
        default: false
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE
      }
    }).then(() => queryInterface.addIndex(TableName, ['eth_address', 'site', 'account'], {unique:true}))
;
  },
  down: (queryInterface, Sequelize) => {
    return queryInterface.dropTable(TableName);
  }
};
