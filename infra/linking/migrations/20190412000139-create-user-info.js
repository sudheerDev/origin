'use strict';
const TableName = 'user_info'

module.exports = {
  up: (queryInterface, Sequelize) => {
    return queryInterface.createTable(TableName, {
      eth_address: {
        type: Sequelize.STRING(64),
        primaryKey:true
      },
      info: {
        type: Sequelize.JSON
      },
      ipfs_hash: {
        type: Sequelize.STRING(64)
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });
  },
  down: (queryInterface, Sequelize) => {
    return queryInterface.dropTable(TableName);
  }
};
