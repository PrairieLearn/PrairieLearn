import { z } from 'zod';

export const BatchedMigrationJobStatusSchema = z.enum([
  'pending',
  'running',
  'failed',
  'succeeded',
]);
export type BatchedMigrationJobStatus = z.infer<typeof BatchedMigrationJobStatusSchema>;

export const BatchedMigrationJobRowSchema = z.object({
  id: z.string(),
  batched_migration_id: z.string(),
  min_value: z.bigint({ coerce: true }),
  max_value: z.bigint({ coerce: true }),
  status: BatchedMigrationJobStatusSchema,
  created_at: z.date(),
  updated_at: z.date(),
  started_at: z.date().nullable(),
  finished_at: z.date().nullable(),
  data: z.any(),
});
export type BatchedMigrationJobRow = z.infer<typeof BatchedMigrationJobRowSchema>;
