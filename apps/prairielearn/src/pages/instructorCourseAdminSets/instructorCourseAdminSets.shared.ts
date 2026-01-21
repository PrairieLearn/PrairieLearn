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
});
export type AssessmentForSet = z.infer<typeof AssessmentForSetSchema>;

export const InstructorCourseAdminSetRowSchema = RawStaffAssessmentSetSchema.extend({
  assessments: z.array(AssessmentForSetSchema),
});

export type InstructorCourseAdminSetRow = z.infer<typeof InstructorCourseAdminSetRowSchema>;
