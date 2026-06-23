import { type HtmlSafeString } from '@prairielearn/html';
import { hydrateHtml } from '@prairielearn/react/server';

import { ansiToHtml } from '../lib/chalk.js';
import type { Course } from '../lib/db-types.js';
import type { JobSequenceWithTokens } from '../lib/server-jobs.types.js';

import { JobSequenceResults as JobSequenceResultsComponent } from './JobSequenceResults.js';
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
    jobSequence: {
      ...jobSequence,
      jobs: jobSequence.jobs.map((job) => ({
        ...job,
        outputHtml: ansiToHtml(job.output),
      })),
    },
    timeZone: course?.display_timezone || 'UTC',
  });
}

/**
 * Renders the results of a job sequence with live updates.
 */
export function JobSequenceResults({
  course,
  jobSequence,
}: {
  course: Course | undefined;
  jobSequence: JobSequenceWithTokens;
}): HtmlSafeString {
  const clientProps = getJobSequenceResultsProps({ course, jobSequence });

  return hydrateHtml(
    <JobSequenceResultsComponent
      jobSequence={clientProps.jobSequence}
      timeZone={clientProps.timeZone}
    />,
  );
}
