import z from 'zod';

import { StaffEnrollmentSchema, StaffUserSchema } from '../../lib/client/safe-db-types.js';
import { EnumEnrollmentStatusSchema, IdSchema } from '../../lib/db-types.js';

export const STATUS_VALUES = Object.values(EnumEnrollmentStatusSchema.Values);

export const StudentGroupInfoSchema = z.object({
  id: IdSchema,
  name: z.string(),
});
export type StudentGroupInfo = z.infer<typeof StudentGroupInfoSchema>;

export const StudentRowSchema = z.object({
  enrollment: StaffEnrollmentSchema,
  user: StaffUserSchema.nullable(),
  student_groups: z.array(StudentGroupInfoSchema),
});

export const StudentRowSchemaWithUser = StudentRowSchema.extend({
  user: StaffUserSchema,
});

export type StudentRow = z.infer<typeof StudentRowSchema>;

export type StudentRowWithUser = z.infer<typeof StudentRowSchemaWithUser>;
