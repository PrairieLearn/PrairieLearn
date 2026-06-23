import { type HtmlSafeString } from '@prairielearn/html';
import { hydrateHtml } from '@prairielearn/react/server';

import { ansiToHtml } from '../lib/chalk.js';
import type { Course } from '../lib/db-types.js';
import type { JobSequenceWithTokens } from '../lib/server-jobs.types.js';

import { JobSequenceResults as JobSequenceResultsComponent } from './JobSequenceResults.js';
import { JobSequenceResultsPropsSchema } from './JobSequenceResults.shared.js';

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
  const timeZone = course?.display_timezone || 'UTC';
  const clientProps = JobSequenceResultsPropsSchema.parse({
    jobSequence: {
      authn_user_uid: jobSequence.authn_user_uid,
      description: jobSequence.description,
      id: jobSequence.id,
      jobs: jobSequence.jobs.map((job) => ({
        arguments: job.arguments,
        command: job.command,
        description: job.description,
        error_message: job.error_message,
        exit_code: job.exit_code,
        exit_signal: job.exit_signal,
        finish_date: job.finish_date,
        id: job.id,
        number_in_sequence: job.number_in_sequence,
        outputHtml: ansiToHtml(job.output),
        start_date: job.start_date,
        status: job.status,
        token: job.token,
        working_directory: job.working_directory,
      })),
      legacy: jobSequence.legacy,
      number: jobSequence.number,
      token: jobSequence.token,
      user_uid: jobSequence.user_uid,
    },
    timeZone,
  });

  return hydrateHtml(
    <JobSequenceResultsComponent
      jobSequence={clientProps.jobSequence}
      timeZone={clientProps.timeZone}
    />,
  );
}
