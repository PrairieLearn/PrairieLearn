import z from 'zod';

import {
  StaffEnrollmentSchema,
  StaffUserSchema,
  StudentLabelInfoSchema,
} from '../../lib/client/safe-db-types.js';
import { EnumEnrollmentStatusSchema } from '../../lib/db-types.js';

export const STATUS_VALUES = Object.values(EnumEnrollmentStatusSchema.Values);

export type StudentLabelInfo = z.infer<typeof StudentLabelInfoSchema>;
export { StudentLabelInfoSchema };

export const StudentRowSchema = z.object({
  enrollment: StaffEnrollmentSchema,
  user: StaffUserSchema.nullable(),
  student_labels: z.array(StudentLabelInfoSchema),
});

export const StudentRowSchemaWithUser = StudentRowSchema.extend({
  user: StaffUserSchema,
});

export type StudentRow = z.infer<typeof StudentRowSchema>;

export type StudentRowWithUser = z.infer<typeof StudentRowSchemaWithUser>;
