'use strict';
const TableName = 'user_info'

module.exports = {
  up: (queryInterface, Sequelize) => {
    return queryInterface.addColumn(
      TableName,
      'hidden',
      {
        type:Sequelize.BOOLEAN,
        defaultValue:false
      }
    )
  },
  down: (queryInterface, Sequelize) => {
    return queryInterface.removeColumn(tablename, 'hidden')
  }
};
