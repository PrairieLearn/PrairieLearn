import { z } from 'zod';

import { logger } from '@prairielearn/logger';
import * as sqldb from '@prairielearn/postgres';

import { CronJobSchema } from '../lib/db-types.js';
import * as opsbot from '../lib/opsbot.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

let activeJobNames: string[] = [];

export function setActiveJobNames(names: string[]) {
  activeJobNames = names;
}

export async function run() {
  if (!opsbot.canSendMessages()) return;

  const rows = await sqldb.queryRows(
    sql.select_unfinished_cron_jobs,
    z.object({
      name: CronJobSchema.shape.name,
      formatted_started_at: z.string(),
    }),
  );
  const activeJobNameSet = new Set(activeJobNames);
  const unfinishedJobs = rows.filter((row) => activeJobNameSet.has(row.name));
  if (unfinishedJobs.length === 0) return;

  let msg = '_Unfinished cron jobs:_\n';
  for (const row of unfinishedJobs) {
    msg += `    *${row.name}:* started at ${row.formatted_started_at} but not finished\n`;
    logger.error('cron:sendUnfinishedCronJobs job not finished', row);
  }

  await opsbot
    .sendMessage(msg)
    .catch((err) => logger.error('Error posting unfinished cron jobs to slack', err.data));
}
