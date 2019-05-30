'use strict';
const TableName = 'user_info'

module.exports = {
  up: (queryInterface, Sequelize) => {
    return Promise.all([ queryInterface.addColumn(
      TableName,
      'flags',
      {
        type:Sequelize.Sequelize.INTEGER,
        defaultValue:0
      }
    ),
    queryInterface.addColumn(
      TableName,
      'banned',
      {
        type:Sequelize.BOOLEAN,
        defaultValue:false
      }
    )
    ])
  },
  down: (queryInterface, Sequelize) => {
    return Promise.all([
      queryInterface.removeColumn(tablename, 'flags'),
      queryInterface.removeColumn(tablename, 'banned')
    ])
  }
};
