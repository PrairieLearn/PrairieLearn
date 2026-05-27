import { setTimeout as sleep } from 'node:timers/promises';

import { config } from '../../../lib/config.js';
import { type EnumJobStatus } from '../../../lib/db-types.js';
import {
  type ServerJob,
  getJobSequence,
  selectJobSequenceStatus,
} from '../../../lib/server-jobs.js';

const POLL_INTERVAL_MS = 1000;

/**
 * Polls a child job sequence until it reaches a terminal status. Returns
 * the final status.
 */
export async function waitForJobSequence(jobSequenceId: string): Promise<EnumJobStatus> {
  while (true) {
    const { status } = await selectJobSequenceStatus(jobSequenceId);
    if (status != null && status !== 'Running' && status !== 'Stopping') {
      return status;
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

/**
 * Logs a per-job status summary for a child job sequence plus a navigable
 * link to the admin job-sequence page. We intentionally don't echo the
 * child jobs' full output — it bloats the parent log. Use the link to
 * drill in when debugging.
 */
export async function forwardChildJobOutput({
  childJobSequenceId,
  courseId,
  parentJob,
  label,
}: {
  childJobSequenceId: string;
  courseId: string | null;
  parentJob: ServerJob;
  label: string;
}): Promise<void> {
  const sequence = await getJobSequence(childJobSequenceId, courseId);
  const host = (config.serverCanonicalHost ?? '').replace(/\/$/, '');
  const path = `/pl/administrator/jobSequence/${childJobSequenceId}`;
  const link = host ? `${host}${path}` : path;
  parentJob.info(`${label}: job sequence ${childJobSequenceId} → ${link}`);
  for (const job of sequence.jobs) {
    parentJob.info(`  job #${job.number_in_sequence}: ${job.status}`);
  }
}
