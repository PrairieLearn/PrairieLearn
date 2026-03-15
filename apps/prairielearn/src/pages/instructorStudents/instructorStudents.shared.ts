import z from 'zod';

import { StaffEnrollmentSchema, StaffUserSchema } from '../../lib/client/safe-db-types.js';
import {
  EnumEnrollmentStatusSchema,
  SprocUsersGetDisplayedRoleSchema,
} from '../../lib/db-types.js';

export const STATUS_VALUES = Object.values(EnumEnrollmentStatusSchema.Values);
export const ROLE_VALUES = SprocUsersGetDisplayedRoleSchema.options;

export const StudentRowSchema = z.object({
  enrollment: StaffEnrollmentSchema,
  user: StaffUserSchema.nullable(),
  role: SprocUsersGetDisplayedRoleSchema,
});

export type StudentRow = z.infer<typeof StudentRowSchema>;
