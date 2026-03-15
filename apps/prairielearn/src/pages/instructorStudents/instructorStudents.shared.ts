import z from 'zod';

import { IdSchema } from '@prairielearn/zod';

import { StaffEnrollmentSchema, StaffUserSchema } from '../../lib/client/safe-db-types.js';
import { EnumEnrollmentStatusSchema } from '../../lib/db-types.js';

export const STATUS_VALUES = Object.values(EnumEnrollmentStatusSchema.Values);

export const StudentRowSchema = z.object({
  enrollment: StaffEnrollmentSchema,
  user: StaffUserSchema.nullable(),
  student_label_ids: z.array(IdSchema),
});

export type StudentRow = z.infer<typeof StudentRowSchema>;
