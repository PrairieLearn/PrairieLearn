import { z } from 'zod';

export const BatchedMigrationStatusSchema = z.enum([
  'pending',
  'paused',
  'running',
  'failed',
  'finished',
]);
export type BatchedMigrationStatus = z.infer<typeof BatchedMigrationStatusSchema>;

export const BatchedMigrationSchema = z.object({
  id: z.string(),
  project: z.string(),
  name: z.string(),
  timestamp: z.string(),
  batch_size: z.number(),
  min_value: z.bigint({ coerce: true }),
  max_value: z.bigint({ coerce: true }),
  status: BatchedMigrationStatusSchema,
  created_at: z.date(),
  updated_at: z.date(),
  started_at: z.date().nullable(),
});
export type BatchedMigrationType = z.infer<typeof BatchedMigrationSchema>;

export const BatchedMigrationJobStatusSchema = z.enum(['pending', 'running', 'failed', 'finished']);
export type BatchedMigrationJobStatus = z.infer<typeof BatchedMigrationJobStatusSchema>;

export const BatchedMigrationJobSchema = z.object({
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
export type BatchedMigrationJobType = z.infer<typeof BatchedMigrationJobSchema>;
