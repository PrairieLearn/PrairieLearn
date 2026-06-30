import z from 'zod';

import { IdSchema } from '@prairielearn/zod';

import { StaffEnrollmentSchema, StaffUserSchema } from '../../lib/client/safe-db-types.js';
import {
  EnumEnrollmentStatusSchema,
  SprocUsersGetDisplayedRoleSchema,
} from '../../lib/db-types.js';

export const STATUS_VALUES = [...EnumEnrollmentStatusSchema.options];
export const ROLE_VALUES = SprocUsersGetDisplayedRoleSchema.options;

export const StudentRowSchema = z.object({
  enrollment: StaffEnrollmentSchema,
  user: StaffUserSchema.nullable(),
  role: SprocUsersGetDisplayedRoleSchema,
  student_label_ids: z.array(IdSchema),
});

export type StudentRow = z.infer<typeof StudentRowSchema>;
