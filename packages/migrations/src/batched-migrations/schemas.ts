import { z } from 'zod';

export const BatchedMigrationSchema = z.object({
  id: z.string(),
  project: z.string(),
  name: z.string(),
  timestamp: z.string(),
  batch_size: z.number(),
  min_value: z.bigint({ coerce: true }),
  max_value: z.bigint({ coerce: true }),
  status: z.enum(['pending', 'paused', 'running', 'completed', 'failed']),
  created_at: z.date(),
  updated_at: z.date(),
  started_at: z.date().nullable(),
});

export type BatchedMigrationType = z.infer<typeof BatchedMigrationSchema>;

export const BatchedMigrationJobSchema = z.object({
  id: z.string(),
  batched_migration_id: z.string(),
  min_value: z.bigint({ coerce: true }),
  max_value: z.bigint({ coerce: true }),
  status: z.enum(['pending', 'running', 'failed', 'finished']),
  created_at: z.date(),
  updated_at: z.date(),
  started_at: z.date().nullable(),
  finished_at: z.date().nullable(),
  data: z.any(),
});

export type BatchedMigrationJobType = z.infer<typeof BatchedMigrationJobSchema>;
