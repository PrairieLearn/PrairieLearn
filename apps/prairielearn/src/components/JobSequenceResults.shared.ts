import { z } from 'zod';

import { JobSchema, JobSequenceSchema } from '../lib/db-types.js';

const JobSequenceResultsJobSchema = z.object({
  arguments: JobSchema.shape.arguments,
  command: JobSchema.shape.command,
  description: JobSchema.shape.description,
  error_message: JobSchema.shape.error_message,
  exit_code: JobSchema.shape.exit_code,
  exit_signal: JobSchema.shape.exit_signal,
  finish_date: JobSchema.shape.finish_date,
  id: JobSchema.shape.id,
  number_in_sequence: JobSchema.shape.number_in_sequence,
  outputHtml: z.string(),
  start_date: JobSchema.shape.start_date,
  status: JobSchema.shape.status,
  token: z.string(),
  working_directory: JobSchema.shape.working_directory,
});

const JobSequenceResultsJobSequenceSchema = z.object({
  authn_user_uid: z.string().nullable(),
  description: JobSequenceSchema.shape.description,
  id: JobSequenceSchema.shape.id,
  jobs: JobSequenceResultsJobSchema.array(),
  legacy: JobSequenceSchema.shape.legacy,
  number: JobSequenceSchema.shape.number,
  token: z.string(),
  user_uid: z.string().nullable(),
});

export const JobSequenceResultsPropsSchema = z.object({
  jobSequence: JobSequenceResultsJobSequenceSchema,
  timeZone: z.string(),
});

export type JobSequenceResultsProps = z.infer<typeof JobSequenceResultsPropsSchema>;
export type JobSequenceResultsJob = JobSequenceResultsProps['jobSequence']['jobs'][number];
