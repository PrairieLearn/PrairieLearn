import z from 'zod';

import { IdSchema } from '@prairielearn/zod';

import { StaffEnrollmentSchema, StaffUserSchema } from '../../lib/client/safe-db-types.js';
import { EnumEnrollmentStatusSchema } from '../../lib/db-types.js';
import { MAX_STUDENT_LABELS_PER_COURSE_INSTANCE } from '../../schemas/infoCourseInstance.js';

export const STATUS_VALUES = [...EnumEnrollmentStatusSchema.options];

export const StudentRowSchema = z.object({
  enrollment: StaffEnrollmentSchema,
  user: StaffUserSchema.nullable(),
  student_label_ids: z.array(IdSchema),
});

export type StudentRow = z.infer<typeof StudentRowSchema>;

export const SyncLabelUpdateSchema = z.object({
  uid: z.email(),
  expected: z
    .object({
      enrollmentId: IdSchema,
      status: EnumEnrollmentStatusSchema,
      labelIds: z.array(IdSchema).max(MAX_STUDENT_LABELS_PER_COURSE_INSTANCE),
    })
    .nullable(),
  labelIds: z.array(IdSchema).max(MAX_STUDENT_LABELS_PER_COURSE_INSTANCE),
});
export type SyncLabelUpdate = z.infer<typeof SyncLabelUpdateSchema>;
export const SyncCsvSchema = z.object({
  text: z.string().min(1).max(1_000_000),
  labelUpdates: z.array(SyncLabelUpdateSchema).max(5000),
});
export type SyncCsv = z.infer<typeof SyncCsvSchema>;
