// @ts-check
const { callbackify } = require('util');

const { config } = require('../lib/config');
const { logger } = require('@prairielearn/logger');
const sqldb = require('@prairielearn/postgres');

const sql = sqldb.loadSqlEquiv(__filename);

module.exports.run = callbackify(async () => {
  const results = await sqldb.queryAsync(sql.clean_time_series, {
    retention_period_sec: config.timeSeriesRetentionPeriodSec,
  });
  logger.verbose(`Deleted ${results.rowCount} old rows from the time_series table`);
});
