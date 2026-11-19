import { stripVTControlCharacters } from 'node:util';

import { CourseActionCardSchema, type CourseActionResult } from '@prairielearn/course-agent-types';

import type { CourseAgentAction } from '../../../../lib/db-types.js';
import { getJobSequence } from '../../../../lib/server-jobs.js';

// The agent receives a job's output as its result; the end of a long log says how it finished.
const MAX_JOB_OUTPUT_LENGTH = 4000;

/** Names the request in its result, so the course agent knows what the outcome is about. */
function named(action: CourseAgentAction) {
  return { name: action.action, title: CourseActionCardSchema.parse(action.card).title };
}

export function deniedCourseActionResult(
  action: CourseAgentAction,
  viaMessage: boolean,
): CourseActionResult {
  return {
    decision: 'denied',
    action: named(action),
    outcome: { status: 'not_attempted' },
    ...(viaMessage ? { viaMessage: true as const } : {}),
  };
}

export function finishedCourseActionResult(
  action: CourseAgentAction,
  outcome: { status: 'succeeded'; summary: string } | { status: 'failed'; error: string },
): CourseActionResult {
  return { decision: 'approved', action: named(action), outcome };
}

/** An approval that PrairieLearn lost before recording how the action ended. */
export function unknownCourseActionResult(action: CourseAgentAction): CourseActionResult {
  return { decision: 'approved', action: named(action), outcome: { status: 'unknown' } };
}

/**
 * The result of an action that ran as a background job, read from the job once it has finished.
 * Returns null while the job is still running.
 */
export async function selectCourseActionJobResult({
  action,
  course_id,
  job_sequence_id,
}: {
  action: CourseAgentAction;
  course_id: string;
  job_sequence_id: string;
}): Promise<CourseActionResult | null> {
  const sequence = await getJobSequence(job_sequence_id, course_id);
  if (sequence.status === 'Running' || sequence.status === 'Stopping') return null;
  const output = stripVTControlCharacters(sequence.jobs.map((job) => job.output ?? '').join('\n'))
    .trim()
    .slice(-MAX_JOB_OUTPUT_LENGTH);
  return finishedCourseActionResult(
    action,
    sequence.status === 'Success'
      ? { status: 'succeeded', summary: output || 'Finished.' }
      : { status: 'failed', error: output || 'The job did not finish.' },
  );
}
