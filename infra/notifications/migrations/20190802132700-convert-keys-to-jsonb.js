'use strict'

module.exports = {
  up: (queryInterface) => {
    return queryInterface.sequelize
      .query(
        'ALTER TABLE push_subscription ALTER COLUMN keys TYPE JSONB USING CAST(keys as JSONB);'
      )
      .then(() => {
        return queryInterface.sequelize.query('DROP EXTENSION IF EXISTS hstore;')
      })
  },
  down: (queryInterface) => {
    return queryInterface.sequelize
      .query('CREATE EXTENSION IF NOT EXISTS hstore;')
      .then(() => {
        return queryInterface.sequelize.query(
          'ALTER TABLE push_subscription ALTER COLUMN keys TYPE HSTORE USING CAST(data as HSTORE);'
        )
      })
  }
}
