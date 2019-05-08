'use strict';
const TableName = 'webrtc_offer'

module.exports = {
  up: (queryInterface, Sequelize) => {
    return queryInterface
      .createTable(TableName, {
        full_id: {
          type: Sequelize.STRING(256),
          primaryKey: true,
          allowNull: false
        },
        from: {
          type: Sequelize.STRING(64),
          allowNull: false
        },
        to: {
          type: Sequelize.STRING(256),
        },
        amount: {
          type: Sequelize.DOUBLE,
          allowNull: false
        },
        amount_type: {
          type: Sequelize.STRING(16),
        },
        dismissed: {
          allownull: false,
          type: Sequelize.BOOLEAN,
          defaultvalue: false
        },
        rejected: {
          allownull: false,
          type: Sequelize.BOOLEAN,
          defaultvalue: false
        },
        active: {
          allowNull: false,
          type: Sequelize.BOOLEAN,
          defaultValue: true
        },
        contract_offer: {
          type: Sequelize.JSON
        },
        init_info: {
          type: Sequelize.JSON
        },
        last_voucher: {
          type: Sequelize.JSON
        },
        last_notify: {
          type: Sequelize.DATE
        },
        created_at: {
          allowNull: false,
          type: Sequelize.DATE
        },
        updated_at: {
          allowNull: false,
          type: Sequelize.DATE
        }
      })
      .then(() => queryInterface.addIndex(TableName, ['from', 'active']))
      .then(() => queryInterface.addIndex(TableName, ['to', 'active']))
  },
  down: (queryInterface, Sequelize) => {
    return queryInterface.dropTable(TableName)
  }
};
