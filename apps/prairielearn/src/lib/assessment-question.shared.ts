import { z } from 'zod';

import {
  StaffAlternativeGroupSchema,
  StaffAssessmentQuestionSchema,
  StaffAssessmentSchema,
  StaffCourseInstanceSchema,
  StaffCourseSchema,
  StaffQuestionSchema,
  StaffTagSchema,
  StaffTopicSchema,
  StaffZoneSchema,
} from '../lib/client/safe-db-types.js';
import { AssessmentSchema, AssessmentSetSchema } from '../lib/db-types.js';

const AssessmentQuestionRowMetaSchema = z.object({
  start_new_zone: z.boolean(),
  start_new_alternative_group: z.boolean(),
  alternative_group_size: z.number(),
});

const OtherAssessmentSchema = z.object({
  assessment_set_abbreviation: AssessmentSetSchema.shape.abbreviation,
  assessment_set_name: AssessmentSetSchema.shape.name,
  assessment_number: AssessmentSchema.shape.number,
  assessment_id: AssessmentSchema.shape.id,
  assessment_course_instance_id: AssessmentSchema.shape.course_instance_id,
  assessment_share_source_publicly: AssessmentSchema.shape.share_source_publicly,
  assessment_set_color: AssessmentSetSchema.shape.color,
});

export type OtherAssessment = z.infer<typeof OtherAssessmentSchema>;

export const StaffAssessmentQuestionSqlSchema = z.object({
  assessment_question: StaffAssessmentQuestionSchema,
  question: StaffQuestionSchema,
  topic: StaffTopicSchema,
  alternative_group: StaffAlternativeGroupSchema,
  zone: StaffZoneSchema,
  assessment: StaffAssessmentSchema,
  course_instance: StaffCourseInstanceSchema,
  course: StaffCourseSchema,
  open_issue_count: z.number(),
  tags: z.array(StaffTagSchema).nullable(),
  other_assessments: OtherAssessmentSchema.array().nullable(),
});

const RawStaffAssessmentQuestionRowSchema = AssessmentQuestionRowMetaSchema.extend(
  StaffAssessmentQuestionSqlSchema.shape,
);

export const StaffAssessmentQuestionRowSchema =
  RawStaffAssessmentQuestionRowSchema.brand<'StaffAssessmentQuestionRow'>();

export type StaffAssessmentQuestionRow = z.infer<typeof StaffAssessmentQuestionRowSchema>;
