import { type HtmlSafeString } from '@prairielearn/html';
import { hydrateHtml } from '@prairielearn/react/server';

import type { Course } from '../lib/db-types.js';
import type { JobSequenceWithTokens } from '../lib/server-jobs.types.js';

import { JobSequenceResults } from './JobSequenceResults.js';
import { getJobSequenceResultsProps } from './JobSequenceResults.types.js';

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
