'use strict';
const TableName = 'user_info'

module.exports = {
  up: (queryInterface, Sequelize) => {
    return queryInterface.addColumn(
      TableName,
      'rank',
      {
        type:Sequelize.INTEGER,
        defaultValue:0
      }
    )
  },
  down: (queryInterface, Sequelize) => {
    return queryInterface.removeColumn(TableName, 'rank')
  }
};
