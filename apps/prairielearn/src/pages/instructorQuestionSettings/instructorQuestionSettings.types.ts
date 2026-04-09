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

export interface PreferenceField {
  name: string;
  type: 'string' | 'number' | 'boolean';
  default: string | number | boolean;
  enum: string[];
}

export interface QuestionSettingsFormValues {
  qid: string;
  title: string;
  topic: string;
  tags: string[];
  grading_method: 'Internal' | 'External' | 'Manual';
  single_variant: boolean;
  show_correct_answer: boolean;
  partial_credit: boolean;
  workspace_enabled: boolean;
  workspace_image: string;
  workspace_port: string;
  workspace_home: string;
  workspace_graded_files: string;
  workspace_args: string;
  workspace_environment: string;
  workspace_enable_networking: boolean;
  workspace_rewrite_url: boolean;
  preferences: PreferenceField[];
  external_grading_enabled: boolean;
  external_grading_image: string;
  external_grading_entrypoint: string;
  external_grading_files: string;
  external_grading_timeout: number | undefined;
  external_grading_enable_networking: boolean;
  external_grading_environment: string;
}
