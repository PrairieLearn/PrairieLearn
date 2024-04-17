import { logger } from '@prairielearn/logger';
import * as opsbot from '../lib/opsbot';
import * as sqldb from '@prairielearn/postgres';

const sql = sqldb.loadSqlEquiv(__filename);

export async function run() {
  if (!opsbot.canSendMessages()) return;

  const result = await sqldb.queryAsync(sql.select_unfinished_cron_jobs, []);
  if (!result.rowCount) return;

  let msg = `_Unfinished cron jobs:_\n`;
  for (const row of result.rows) {
    msg += `    *${row.name}:* started at ${row.formatted_started_at} but not finished\n`;
    logger.error('cron:sendUnfinishedCronJobs job not finished', row);
  }

  await opsbot
    .sendMessage(msg)
    .catch((err) => logger.error(`Error posting unfinished cron jobs to slack`, err.data));
}
