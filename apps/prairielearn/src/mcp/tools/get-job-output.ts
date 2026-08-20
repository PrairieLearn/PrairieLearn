import { type Course } from '../../lib/db-types.js';
import { getJobSequence } from '../../lib/server-jobs.js';

export interface JobOutputResult {
  jobSequenceId: string;
  type: string | null;
  description: string | null;
  status: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  jobs: {
    status: string | null;
    description: string | null;
    errorMessage: string | null;
    output: string | null;
  }[];
}

/**
 * Reads the output of a job sequence. Long-running PrairieLearn operations
 * (syncs, regrades, question tests started through the UI) run as job sequences,
 * so this is how the agent inspects work it didn't run inline.
 *
 * Scoped to the current course, so it can't read another course's job output.
 */
export async function getJobOutput({
  course,
  jobSequenceId,
}: {
  course: Course;
  jobSequenceId: string;
}): Promise<JobOutputResult> {
  const jobSequence = await getJobSequence(jobSequenceId, course.id);

  return {
    jobSequenceId: jobSequence.id,
    type: jobSequence.type,
    description: jobSequence.description,
    status: jobSequence.status,
    startedAt: jobSequence.start_date,
    finishedAt: jobSequence.finish_date,
    jobs: jobSequence.jobs.map((job) => ({
      status: job.status,
      description: job.description,
      errorMessage: job.error_message,
      output: job.output,
    })),
  };
}
