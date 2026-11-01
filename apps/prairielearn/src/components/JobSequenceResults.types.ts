import { z } from 'zod';

import { ansiToHtml } from '../lib/chalk.js';
import { RawStaffJobSchema, RawStaffJobSequenceSchema } from '../lib/client/safe-db-types.js';
import type { Course } from '../lib/db-types.js';
import type { JobSequenceWithTokens } from '../lib/server-jobs.types.js';

const JobSequenceResultsJobSchema = RawStaffJobSchema.omit({
  output: true,
}).extend({
  outputHtml: z.string(),
  token: z.string(),
});

const JobSequenceResultsPropsSchema = z.object({
  authnUserUid: z.string().nullable(),
  jobs: JobSequenceResultsJobSchema.array(),
  jobSequence: RawStaffJobSequenceSchema,
  jobSequenceToken: z.string(),
  timeZone: z.string(),
  userUid: z.string().nullable(),
});

export type JobSequenceResultsProps = z.infer<typeof JobSequenceResultsPropsSchema>;
export type JobSequenceResultsJob = JobSequenceResultsProps['jobs'][number];

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
