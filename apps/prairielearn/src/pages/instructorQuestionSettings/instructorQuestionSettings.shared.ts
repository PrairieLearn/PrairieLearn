import z from 'zod';

import { IdSchema } from '@prairielearn/zod';

import { AssessmentSchema, AssessmentSetSchema, CourseInstanceSchema } from '../../lib/db-types.js';

export const SelectedAssessmentsSchema = z.object({
  short_name: CourseInstanceSchema.shape.short_name,
  long_name: CourseInstanceSchema.shape.long_name,
  course_instance_id: IdSchema,
  assessments: z.array(
    z.object({
      assessment_id: IdSchema,
      color: AssessmentSetSchema.shape.color,
      label: AssessmentSetSchema.shape.abbreviation,
      title: AssessmentSchema.shape.title,
      type: AssessmentSchema.shape.type,
    }),
  ),
});
export type SelectedAssessments = z.infer<typeof SelectedAssessmentsSchema>;

export const SharingSetRowSchema = z.object({
  id: IdSchema,
  name: z.string(),
  in_set: z.boolean(),
});
export type SharingSetRow = z.infer<typeof SharingSetRowSchema>;

export const EditableCourseSchema = z.object({
  id: IdSchema,
  short_name: z.string(),
});
export type EditableCourse = z.infer<typeof EditableCourseSchema>;
