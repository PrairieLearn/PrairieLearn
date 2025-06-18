import z from 'zod';

import { EnrollmentSchema, UserSchema } from '../../lib/db-types.js';

export const StudentRowSchema = z.object({
  uid: UserSchema.shape.uid,
  name: UserSchema.shape.name,
  email: UserSchema.shape.email,
  course_instance_id: EnrollmentSchema.shape.course_instance_id,
  created_at: EnrollmentSchema.shape.created_at,
});
export type StudentRow = z.infer<typeof StudentRowSchema>;
