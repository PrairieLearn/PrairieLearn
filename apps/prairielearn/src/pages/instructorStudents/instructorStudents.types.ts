import z from 'zod';

import {
  type Enrollment,
  EnrollmentSchema,
  type StudentUser,
  StudentUserSchema,
} from '../../lib/db-types.js';

export const StudentRowSchema = z.object({
  enrollment: EnrollmentSchema,
  user: StudentUserSchema,
});

export type StudentRow = Enrollment & StudentUser;
