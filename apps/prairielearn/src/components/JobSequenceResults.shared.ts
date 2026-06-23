import { z } from 'zod';

import { RawStaffJobSchema, RawStaffJobSequenceSchema } from '../lib/client/safe-db-types.js';

const JobSequenceResultsJobSchema = RawStaffJobSchema.omit({
  output: true,
}).extend({
  outputHtml: z.string(),
  token: z.string(),
});

const JobSequenceResultsJobSequenceSchema = RawStaffJobSequenceSchema.extend({
  authn_user_uid: z.string().nullable(),
  jobs: JobSequenceResultsJobSchema.array(),
  token: z.string(),
  user_uid: z.string().nullable(),
});

export const JobSequenceResultsPropsSchema = z.object({
  jobSequence: JobSequenceResultsJobSequenceSchema,
  timeZone: z.string(),
});

export type JobSequenceResultsProps = z.infer<typeof JobSequenceResultsPropsSchema>;
export type JobSequenceResultsJob = JobSequenceResultsProps['jobSequence']['jobs'][number];
