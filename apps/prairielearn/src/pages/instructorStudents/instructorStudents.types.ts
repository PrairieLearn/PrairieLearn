import { z } from 'zod';

import { EnrollmentSchema, UserSchema } from '../../lib/db-types.js';

export const StudentRowSchema = z.object({
  user_id: UserSchema.shape.user_id,
  uid: UserSchema.shape.uid,
  uin: UserSchema.shape.uin,
  user_name: UserSchema.shape.name,
  email: UserSchema.shape.email,
  enrollment_id: EnrollmentSchema.shape.id,
  created_at: EnrollmentSchema.shape.created_at,
  role: z.enum(['Staff', 'Student', 'None']),
});
export type StudentRow = z.infer<typeof StudentRowSchema>;

export interface InstructorStudentsData {
  urlPrefix: string;
  csvFilename: string;
  csrfToken: string;
  hasCourseInstancePermissionEdit: boolean;
  students: StudentRow[];
}
