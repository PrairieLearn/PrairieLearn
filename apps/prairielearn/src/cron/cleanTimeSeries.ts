import { logger } from '@prairielearn/logger';
import * as sqldb from '@prairielearn/postgres';

import { config } from '../lib/config.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

export async function run() {
  const results = await sqldb.queryAsync(sql.clean_time_series, {
    retention_period_sec: config.timeSeriesRetentionPeriodSec,
  });
  logger.verbose(`Deleted ${results.rowCount} old rows from the time_series table`);
}
