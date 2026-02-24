import z from 'zod';

import { IdSchema } from '@prairielearn/zod';

import { RawStaffAssessmentSetSchema } from '../../lib/client/safe-db-types.js';

export const AssessmentForSetSchema = z.object({
  assessment_id: IdSchema,
  tid: z.string(),
  title: z.string(),
  label: z.string(),
  color: z.string(),
  course_instance_id: IdSchema,
  course_instance_short_name: z.string().nullable(),
  course_instance_long_name: z.string().nullable(),
});
export type AssessmentForSet = z.infer<typeof AssessmentForSetSchema>;

// Database type
export const InstructorCourseAdminSetRowSchema = RawStaffAssessmentSetSchema.extend({
  assessments: z.array(AssessmentForSetSchema),
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
