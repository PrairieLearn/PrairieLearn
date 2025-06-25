import z from 'zod';

import { StaffUserSchema } from '../../lib/client/safe-db-types.js';
import { EnrollmentSchema } from '../../lib/db-types.js';

export const StudentRowSchema = z.object({
  enrollment: EnrollmentSchema,
  user: StaffUserSchema,
});

export type StudentRow = z.infer<typeof StudentRowSchema>;
