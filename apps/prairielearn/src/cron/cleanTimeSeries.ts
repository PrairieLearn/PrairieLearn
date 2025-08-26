import { logger } from '@prairielearn/logger';
import * as sqldb from '@prairielearn/postgres';

import { config } from '../lib/config.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

export async function run() {
  const rowCount = await sqldb.execute(sql.clean_time_series, {
    retention_period_sec: config.timeSeriesRetentionPeriodSec,
  });
  logger.verbose(`Deleted ${rowCount} old rows from the time_series table`);
}
