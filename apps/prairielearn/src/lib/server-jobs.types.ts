import { z } from 'zod';

import { JobSchema, JobSequenceSchema, UserSchema } from './db-types.js';

const JobRowSchema = JobSchema.extend({
  start_date_formatted: z.string().nullable(),
  finish_date_formatted: z.string().nullable(),
  user_uid: UserSchema.shape.uid.nullable(),
  authn_user_uid: UserSchema.shape.uid.nullable(),
});
type JobRow = z.infer<typeof JobRowSchema>;

export const JobSequenceWithJobsSchema = JobSequenceSchema.extend({
  start_date_formatted: z.string().nullable(),
  finish_date_formatted: z.string().nullable(),
  user_uid: UserSchema.shape.uid.nullable(),
  authn_user_uid: UserSchema.shape.uid.nullable(),
  job_count: z.coerce.number(),
  jobs: JobRowSchema.array(),
});
export type JobSequenceWithJobs = z.infer<typeof JobSequenceWithJobsSchema>;

export type JobWithToken = JobRow & { token: string };
export type JobSequenceWithTokens = Omit<JobSequenceWithJobs, 'jobs'> & {
  token: string;
  jobs: JobWithToken[];
};
