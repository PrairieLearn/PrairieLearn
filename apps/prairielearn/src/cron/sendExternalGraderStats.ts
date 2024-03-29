import { config } from '../lib/config';
import { logger } from '@prairielearn/logger';
import * as opsbot from '../lib/opsbot';
import * as sqldb from '@prairielearn/postgres';

export async function run() {
  if (!opsbot.canSendMessages()) return;

  const result = await sqldb.callOneRowAsync('grading_jobs_stats_day', []);
  const {
    count,
    delta_total,
    delta_submitted_at,
    delta_received_at,
    delta_started_at,
    delta_finished_at,
    delta_final,
    max_total,
    max_submitted_at,
    max_received_at,
    max_started_at,
    max_finished_at,
    max_final,
  } = result.rows[0];
  logger.verbose('cron:sendExternalGraderStats', {
    queueName: config.externalGradingJobsQueueName,
    ...result.rows[0],
  });

  let msg = `_External grading stats, past 24 hours:_ *${config.externalGradingJobsQueueName}*\n`;
  msg += `Count: *${count}*\n`;
  msg += `Average total duration: *${Number(delta_total).toFixed(2)} s*\n`;
  msg += `Individual averages:\n`;
  msg += `    Average time to submit: *${Number(delta_submitted_at).toFixed(2)} s*\n`;
  msg += `    Average time to queue: *${Number(delta_received_at).toFixed(2)} s*\n`;
  msg += `    Average time to start: *${Number(delta_started_at).toFixed(2)} s*\n`;
  msg += `    Average time to execute: *${Number(delta_finished_at).toFixed(2)} s*\n`;
  msg += `    Average time to report: *${Number(delta_final).toFixed(2)} s*\n`;
  msg += `Maximum total duration: *${Number(max_total).toFixed(2)} s*\n`;
  msg += `Individual maximums:\n`;
  msg += `    Maximum time to submit: *${Number(max_submitted_at).toFixed(2)} s*\n`;
  msg += `    Maximum time to queue: *${Number(max_received_at).toFixed(2)} s*\n`;
  msg += `    Maximum time to start: *${Number(max_started_at).toFixed(2)} s*\n`;
  msg += `    Maximum time to execute: *${Number(max_finished_at).toFixed(2)} s*\n`;
  msg += `    Maximum time to report: *${Number(max_final).toFixed(2)} s*\n`;

  await opsbot
    .sendMessage(msg)
    .catch((err) => logger.error(`Error posting external grading stats to slack`, err.data));
}
