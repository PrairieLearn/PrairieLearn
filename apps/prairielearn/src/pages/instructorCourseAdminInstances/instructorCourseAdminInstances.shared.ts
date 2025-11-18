import z from 'zod';

import { RawStaffCourseInstanceSchema } from '../../lib/client/safe-db-types.js';

export const InstructorCourseAdminInstanceRowSchema = RawStaffCourseInstanceSchema.extend({
  formatted_start_date: z.string(),
  formatted_end_date: z.string(),
  has_course_instance_permission_view: z.boolean(),
  has_course_instance_permission_edit: z.boolean(),
  enrollment_count: z.number(),
});

export type InstructorCourseAdminInstanceRow = z.infer<
  typeof InstructorCourseAdminInstanceRowSchema
>;
