import z from 'zod';

import { IdSchema } from '@prairielearn/zod';

import { AssessmentUsageSchema } from '../../lib/client/assessment-usage.js';
import { RawStaffAssessmentSetSchema } from '../../lib/client/safe-db-types.js';

// Database type
export const InstructorCourseAdminSetRowSchema = RawStaffAssessmentSetSchema.extend({
  assessments: z.array(AssessmentUsageSchema),
});

// Internal form state - id and course_id can be null for newly created sets
export const InstructorCourseAdminSetFormRowSchema = InstructorCourseAdminSetRowSchema.omit({
  id: true,
  course_id: true,
}).extend({
  trackingId: z.string(),
  id: IdSchema.nullable(),
  course_id: IdSchema.nullable(),
});

export type InstructorCourseAdminSetFormRow = z.infer<typeof InstructorCourseAdminSetFormRowSchema>;
