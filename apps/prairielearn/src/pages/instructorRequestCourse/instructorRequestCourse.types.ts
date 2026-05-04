import z from 'zod';

import { CourseRequestSchema, UserSchema } from '../../lib/db-types.js';

export const CourseRequestRowSchema = z.object({
  course_request: CourseRequestSchema,
  approved_by_user: UserSchema.nullable(),
});
export type CourseRequestRow = z.infer<typeof CourseRequestRowSchema>;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const Lti13CourseRequestInputSchema = z
  .object({
    'cr-firstname': z.string(),
    'cr-lastname': z.string(),
    'cr-email': z.string(),
    'cr-shortname': z.string(),
    'cr-title': z.string(),
    'cr-institution': z.string(),
  })
  .nullable();
export type Lti13CourseRequestInput = z.infer<typeof Lti13CourseRequestInputSchema>;
