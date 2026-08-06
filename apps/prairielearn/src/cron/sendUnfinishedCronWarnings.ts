import { formatDateISO } from '@prairielearn/formatter';
import { logger } from '@prairielearn/logger';
import * as sqldb from '@prairielearn/postgres';
import * as Sentry from '@prairielearn/sentry';

import { CronJobSchema } from '../lib/db-types.js';
import * as slack from '../lib/slack.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

export async function run() {
  if (!slack.canSendOpsMessages()) return;

  const result = await sqldb.queryRows(
    sql.select_unfinished_cron_jobs,
    CronJobSchema.pick({ name: true, date: true }),
  );
  if (result.length === 0) return;

  let msg = '_Unfinished cron jobs:_\n';
  for (const row of result) {
    msg += `    *${row.name}:* started at ${formatDateISO(row.date, 'UTC')} but not finished\n`;
    logger.error('cron:sendUnfinishedCronJobs job not finished', row);
  }

  await slack.sendOpsMessage(msg).catch((err) => {
    logger.error('Error posting unfinished cron jobs to slack', err.data);
    Sentry.captureException(err);
  });
}
