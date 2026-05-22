import { z } from 'zod';

import { RawStaffJobSequenceSchema, StaffJobSchema } from './client/safe-db-types.js';
import { JobSchema, JobSequenceSchema, UserSchema } from './db-types.js';

const JobRowSchema = JobSchema.extend({
  user_uid: UserSchema.shape.uid.nullable(),
  authn_user_uid: UserSchema.shape.uid.nullable(),
});
type JobRow = z.infer<typeof JobRowSchema>;

export const JobSequenceWithJobsSchema = JobSequenceSchema.extend({
  user_uid: UserSchema.shape.uid.nullable(),
  authn_user_uid: UserSchema.shape.uid.nullable(),
  job_count: z.coerce.number(),
  jobs: JobRowSchema.array(),
});
type JobSequenceWithJobs = z.infer<typeof JobSequenceWithJobsSchema>;

export type JobWithToken = JobRow & { token: string };
export type JobSequenceWithTokens = Omit<JobSequenceWithJobs, 'jobs'> & {
  token: string;
  jobs: JobWithToken[];
};

/**
 * The safe subset of a job sequence and its jobs for rendering on client pages.
 * `JobSequenceResults` is hydrated on the file editor page, so the raw
 * `JobSequenceWithTokens` (which carries `env`, `data`, and internal ids) must
 * be parsed through this schema to strip it before it crosses to the client.
 */
export const StaffJobSequenceWithJobsSchema = RawStaffJobSequenceSchema.extend({
  authn_user_uid: z.string().nullable(),
  jobs: StaffJobSchema.array(),
  user_uid: z.string().nullable(),
});
export type StaffJobSequenceWithJobs = z.infer<typeof StaffJobSequenceWithJobsSchema>;
