'use strict'

module.exports = {
  up: (queryInterface, Sequelize) => {
    return queryInterface.sequelize
      .query(
        'ALTER TABLE push_subscription ALTER COLUMN keys TYPE JSONB USING CAST(keys as JSONB);'
      )
      .then(async () => {
        await queryInterface.sequelize.query('DROP EXTENSION IF EXISTS hstore;')
      })
  },
  down: async (queryInterface, Sequelize) => {
    return queryInterface.sequelize
      .query('CREATE EXTENSION IF NOT EXISTS hstore;')
      .then(async () => {
        queryInterface.sequelize.query(
          'ALTER TABLE push_subscription ALTER COLUMN keys TYPE HSTORE USING CAST(data as HSTORE);'
        )
      })
  }
}
