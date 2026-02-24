import z from 'zod';

import { IdSchema } from '@prairielearn/zod';

import {
  RawStaffAssessmentSchema,
  RawStaffAssessmentSetSchema,
  RawStaffCourseInstanceSchema,
  RawStaffCourseSchema,
} from '../../lib/client/safe-db-types.js';

export const SelectedAssessmentsSchema = z.object({
  short_name: RawStaffCourseInstanceSchema.shape.short_name,
  long_name: RawStaffCourseInstanceSchema.shape.long_name,
  course_instance_id: IdSchema,
  assessments: z.array(
    z.object({
      assessment_id: IdSchema,
      color: RawStaffAssessmentSetSchema.shape.color,
      label: RawStaffAssessmentSetSchema.shape.abbreviation,
      title: RawStaffAssessmentSchema.shape.title,
      type: RawStaffAssessmentSchema.shape.type,
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
  id: RawStaffCourseSchema.shape.id,
  short_name: RawStaffCourseSchema.shape.short_name,
});
export type EditableCourse = z.infer<typeof EditableCourseSchema>;
