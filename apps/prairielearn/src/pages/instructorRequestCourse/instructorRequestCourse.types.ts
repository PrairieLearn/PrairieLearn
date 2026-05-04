import z from 'zod';

import { CourseRequestSchema, UserSchema } from '../../lib/db-types.js';

export const CourseRequestRowSchema = z.object({
  course_request: CourseRequestSchema,
  approved_by_user: UserSchema.nullable(),
});
export type CourseRequestRow = z.infer<typeof CourseRequestRowSchema>;

export type Lti13CourseRequestInput = {
  'cr-firstname': string;
  'cr-lastname': string;
  'cr-email': string;
  'cr-shortname': string;
  'cr-title': string;
  'cr-institution': string;
} | null;
