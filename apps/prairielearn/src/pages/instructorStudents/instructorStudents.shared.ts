import z from 'zod';

import {
  StaffEnrollmentSchema,
  StaffStudentLabelSchema,
  StaffUserSchema,
} from '../../lib/client/safe-db-types.js';
import { EnumEnrollmentStatusSchema } from '../../lib/db-types.js';

export const STATUS_VALUES = Object.values(EnumEnrollmentStatusSchema.Values);

export const StudentRowSchema = z.object({
  enrollment: StaffEnrollmentSchema,
  user: StaffUserSchema.nullable(),
  student_labels: z.array(StaffStudentLabelSchema),
});

export const StudentRowSchemaWithUser = StudentRowSchema.extend({
  user: StaffUserSchema,
});

export type StudentRow = z.infer<typeof StudentRowSchema>;

export type StudentRowWithUser = z.infer<typeof StudentRowSchemaWithUser>;
