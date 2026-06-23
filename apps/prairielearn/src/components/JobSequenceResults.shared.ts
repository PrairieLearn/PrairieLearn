import { z } from 'zod';

import { RawStaffJobSchema, RawStaffJobSequenceSchema } from '../lib/client/safe-db-types.js';

const JobSequenceResultsJobSchema = RawStaffJobSchema.omit({
  output: true,
}).extend({
  outputHtml: z.string(),
  token: z.string(),
});

export const JobSequenceResultsPropsSchema = z.object({
  authnUserUid: z.string().nullable(),
  jobs: JobSequenceResultsJobSchema.array(),
  jobSequence: RawStaffJobSequenceSchema,
  jobSequenceToken: z.string(),
  timeZone: z.string(),
  userUid: z.string().nullable(),
});

export type JobSequenceResultsProps = z.infer<typeof JobSequenceResultsPropsSchema>;
export type JobSequenceResultsJob = JobSequenceResultsProps['jobs'][number];
