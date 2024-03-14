import { logger } from '@prairielearn/logger';
import * as sqldb from '@prairielearn/postgres';

import { config } from '../lib/config';

const sql = sqldb.loadSqlEquiv(__filename);

export async function run() {
  const results = await sqldb.queryAsync(sql.clean_time_series, {
    retention_period_sec: config.timeSeriesRetentionPeriodSec,
  });
  logger.verbose(`Deleted ${results.rowCount} old rows from the time_series table`);
}
