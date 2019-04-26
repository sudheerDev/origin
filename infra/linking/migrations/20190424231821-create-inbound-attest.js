'use strict';
const tableName = 'inbound_attest'
module.exports = {
  up: (queryInterface, Sequelize) => {
    return queryInterface.createTable(tableName, {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      attested_site_id: {
        type: Sequelize.INTEGER,
        references: {
          model: 'attested_site', // name of Target model
          key: 'id' // key in Target model that we're referencing
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      url: {
        type: Sequelize.STRING,
        allowNull: false
      },
      sanitized_url: {
        type: Sequelize.STRING,
        allowNull: false
      },
      info : {
        type: Sequelize.JSON
      },
      eth_address: {
        type: Sequelize.STRING(64),
        allowNull: false
      },
      verified: {
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
    }).then(() => queryInterface.addIndex(tableName, ['url', 'eth_address']))
    .then(() => queryInterface.addIndex(tableName, ['sanitized_url', 'eth_address']))
  },
  down: (queryInterface) => {
    return queryInterface.dropTable(tableName)
  }
}
