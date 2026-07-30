import { z } from 'zod';

import {
  StaffAlternativePoolSchema,
  StaffAssessmentQuestionSchema,
  StaffAssessmentSchema,
  type StaffCourse,
  StaffCourseInstanceSchema,
  StaffCourseSchema,
  type StaffQuestion,
  StaffQuestionSchema,
  type StaffTag,
  StaffTagSchema,
  type StaffTopic,
  StaffTopicSchema,
  StaffZoneSchema,
} from '../lib/client/safe-db-types.js';
import { AssessmentSchema, AssessmentSetSchema } from '../lib/db-types.js';

const AssessmentQuestionRowMetaSchema = z.object({
  start_new_zone: z.boolean(),
  start_new_alternative_pool: z.boolean(),
  alternative_pool_size: z.number(),
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
  alternative_pool: StaffAlternativePoolSchema,
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

/**
 * Lightweight metadata type for the assessment editor. Contains only the
 * fields the editor actually reads, avoiding the need to construct dummy
 * zone / alternative_pool / assessment_question objects.
 */
export interface EditorQuestionMetadata {
  question: StaffQuestion;
  topic: StaffTopic;
  course: StaffCourse;
  tags: StaffTag[] | null;
  other_assessments: OtherAssessment[] | null;
  open_issue_count: number;
  assessment_question_id: string | null;
}
