import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';
const sql = sqldb.loadSqlEquiv(import.meta.url);

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
import {
  type AssessmentQuestion,
  AssessmentQuestionSchema,
  AssessmentSchema,
  AssessmentSetSchema,
} from '../lib/db-types.js';

const AssessmentQuestionRowMetaSchema = z.object({
  start_new_zone: z.boolean(),
  start_new_alternative_group: z.boolean(),
  alternative_group_size: z.number(),
});

const OtherAssessmentSchema = z.object({
  assessment_set_abbreviation: AssessmentSetSchema.shape.abbreviation,
  assessment_number: AssessmentSchema.shape.number,
  assessment_id: AssessmentSchema.shape.id,
  assessment_course_instance_id: AssessmentSchema.shape.course_instance_id,
  assessment_share_source_publicly: AssessmentSchema.shape.share_source_publicly,
  assessment_set_color: AssessmentSetSchema.shape.color,
});

export type OtherAssessment = z.infer<typeof OtherAssessmentSchema>;

const StaffAssessmentQuestionSqlSchema = z.object({
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

export async function selectAssessmentQuestionById(id: string): Promise<AssessmentQuestion> {
  return await sqldb.queryRow(
    sql.select_assessment_question_by_id,
    { id },
    AssessmentQuestionSchema,
  );
}

export async function selectAssessmentQuestionByQuestionId({
  assessment_id,
  question_id,
}: {
  assessment_id: string;
  question_id: string;
}): Promise<AssessmentQuestion> {
  return await sqldb.queryRow(
    sql.select_assessment_question_by_question_id,
    { assessment_id, question_id },
    AssessmentQuestionSchema,
  );
}

export async function selectAssessmentQuestions({
  assessment_id,
}: {
  assessment_id: string;
}): Promise<StaffAssessmentQuestionRow[]> {
  const rows = await sqldb.queryRows(
    sql.select_assessment_questions,
    { assessment_id },
    StaffAssessmentQuestionSqlSchema,
  );

  const groupCounts: Record<string, number> = {};
  for (const row of rows) {
    const groupId = row.alternative_group.id;
    groupCounts[groupId] = (groupCounts[groupId] || 0) + 1;
  }
  let prevZoneId: string | null = null;
  let prevAltGroupId: string | null = null;

  const result: StaffAssessmentQuestionRow[] = [];
  for (const row of rows) {
    const start_new_zone = row.zone.id !== prevZoneId;
    const start_new_alternative_group = row.alternative_group.id !== prevAltGroupId;
    const alternative_group_size = groupCounts[row.alternative_group.id];
    result.push({
      ...row,
      start_new_zone,
      start_new_alternative_group,
      alternative_group_size,
    } as StaffAssessmentQuestionRow);
    prevZoneId = row.zone.id;
    prevAltGroupId = row.alternative_group.id;
  }
  return result;
}
