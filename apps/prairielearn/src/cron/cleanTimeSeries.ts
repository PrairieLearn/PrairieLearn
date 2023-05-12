import { callbackify } from 'util';
import { logger } from '@prairielearn/logger';
import sqldb = require('@prairielearn/postgres');

import { config } from '../lib/config';

const sql = sqldb.loadSqlEquiv(__filename);

export const run = callbackify(async () => {
  const results = await sqldb.queryAsync(sql.clean_time_series, {
    retention_period_sec: config.timeSeriesRetentionPeriodSec,
  });
  logger.verbose(`Deleted ${results.rowCount} old rows from the time_series table`);
});
