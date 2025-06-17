import { z } from 'zod';

import { EnrollmentSchema, UserSchema } from '../../lib/db-types.js';

export const StudentRowSchema = z.object({
  ...EnrollmentSchema.shape,
  ...UserSchema.shape,
});
export type StudentRow = z.infer<typeof StudentRowSchema>;

export interface InstructorStudentsData {
  urlPrefix: string;
  csvFilename: string;
  csrfToken: string;
  hasCourseInstancePermissionEdit: boolean;
  students: StudentRow[];
}
