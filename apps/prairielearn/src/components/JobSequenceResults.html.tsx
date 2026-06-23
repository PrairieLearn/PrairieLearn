import { type HtmlSafeString } from '@prairielearn/html';
import { hydrateHtml } from '@prairielearn/react/server';

import { ansiToHtml } from '../lib/chalk.js';
import type { Course } from '../lib/db-types.js';
import type { JobSequenceWithTokens } from '../lib/server-jobs.types.js';

import { JobSequenceResults } from './JobSequenceResults.js';
import {
  type JobSequenceResultsProps,
  JobSequenceResultsPropsSchema,
} from './JobSequenceResults.shared.js';

export function getJobSequenceResultsProps({
  course,
  jobSequence,
}: {
  course: Course | undefined;
  jobSequence: JobSequenceWithTokens;
}): JobSequenceResultsProps {
  return JobSequenceResultsPropsSchema.parse({
    authnUserUid: jobSequence.authn_user_uid,
    jobs: jobSequence.jobs.map((job) => ({
      ...job,
      outputHtml: ansiToHtml(job.output),
    })),
    jobSequence,
    jobSequenceToken: jobSequence.token,
    timeZone: course?.display_timezone || 'UTC',
    userUid: jobSequence.user_uid,
  });
}

/**
 * Renders the results of a job sequence with live updates.
 */
export function JobSequenceResultsHtml({
  course,
  jobSequence,
}: {
  course: Course | undefined;
  jobSequence: JobSequenceWithTokens;
}): HtmlSafeString {
  const clientProps = getJobSequenceResultsProps({ course, jobSequence });

  return hydrateHtml(
    <JobSequenceResults
      authnUserUid={clientProps.authnUserUid}
      jobs={clientProps.jobs}
      jobSequence={clientProps.jobSequence}
      jobSequenceToken={clientProps.jobSequenceToken}
      timeZone={clientProps.timeZone}
      userUid={clientProps.userUid}
    />,
  );
}
