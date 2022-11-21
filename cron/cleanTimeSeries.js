// @ts-check
const { callbackify } = require('util');

const logger = require('../lib/logger');
const sqldb = require('../prairielib/lib/sql-db');
const sqlLoader = require('../prairielib/lib/sql-loader');

const sql = sqlLoader.loadSqlEquiv(__filename);

module.exports.run = callbackify(async () => {
  const result = await sqldb.queryAsync(sql.clean_time_series);
  logger.verbose(`Deleted ${result.rowCount} old rows from time_series table`);
});
