import { setTimeout as sleep } from 'node:timers/promises';

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
 * Dumps the full output of every job in a child job sequence into the parent
 * eval job's log, prefixed by job number. The orchestrator and its child
 * jobs (submissions upload, AI grading) live in separate `job_sequences`, so
 * without this their logs are invisible from the eval job sequence page.
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
  parentJob.info(`---- ${label} (job sequence ${childJobSequenceId}) output ----`);
  for (const job of sequence.jobs) {
    parentJob.info(`-- job #${job.number_in_sequence} (status: ${job.status}) --`);
    if (job.output) {
      parentJob.info(job.output);
    } else {
      parentJob.info('(no output)');
    }
  }
  parentJob.info(`---- end of ${label} output ----`);
}
