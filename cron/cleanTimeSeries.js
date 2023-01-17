// @ts-check
const { callbackify } = require('util');

const config = require('../lib/config');
const logger = require('../lib/logger');
const sqldb = require('../prairielib/lib/sql-db');
const sqlLoader = require('../prairielib/lib/sql-loader');

const sql = sqlLoader.loadSqlEquiv(__filename);

module.exports.run = callbackify(async () => {
  const results = await sqldb.queryAsync(sql.clean_time_series, {
    retention_period_sec: config.timeSeriesRetentionPeriodSec,
  });
  logger.verbose(`Deleted ${results.rowCount} old rows from the time_series table`);
});
