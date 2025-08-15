import { z } from 'zod';

import { logger } from '@prairielearn/logger';
import * as sqldb from '@prairielearn/postgres';

import { CronJobSchema } from '../lib/db-types.js';
import * as opsbot from '../lib/opsbot.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

export async function run() {
  if (!opsbot.canSendMessages()) return;

  const result = await sqldb.queryRows(
    sql.select_unfinished_cron_jobs,
    z.object({
      name: CronJobSchema.shape.name,
      formatted_started_at: z.string(),
    }),
  );
  if (result.length === 0) return;

  let msg = '_Unfinished cron jobs:_\n';
  for (const row of result) {
    msg += `    *${row.name}:* started at ${row.formatted_started_at} but not finished\n`;
    logger.error('cron:sendUnfinishedCronJobs job not finished', row);
  }

  await opsbot
    .sendMessage(msg)
    .catch((err) => logger.error('Error posting unfinished cron jobs to slack', err.data));
}
