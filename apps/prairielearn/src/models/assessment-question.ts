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

export const RawAssessmentQuestionRowSchema = z.object({
  assessment_question: StaffAssessmentQuestionSchema,
  question: StaffQuestionSchema,
  topic: StaffTopicSchema,
  alternative_group: StaffAlternativeGroupSchema,
  zone: StaffZoneSchema,
  assessment: StaffAssessmentSchema,
  course_instance: StaffCourseInstanceSchema,
  course: StaffCourseSchema,
  number_in_alternative_group: z.number().nullable(),
  open_issue_count: z.number(),
  tags: z.array(StaffTagSchema).nullable(),
  other_assessments: z
    .array(
      z.object({
        label: z.string(),
        assessment_id: z.string(),
        course_instance_id: z.string(),
        share_source_publicly: z.boolean(),
        color: z.string(),
      }),
    )
    .nullable(),
});
export type RawAssessmentQuestionRow = z.infer<typeof RawAssessmentQuestionRowSchema>;

export const AssessmentQuestionRowSchema = RawAssessmentQuestionRowSchema.extend({
  start_new_zone: z.boolean(),
  start_new_alternative_group: z.boolean(),
  alternative_group_size: z.number(),
}).brand<'AssessmentQuestionRow'>();
export type AssessmentQuestionRow = z.infer<typeof AssessmentQuestionRowSchema>;

export async function selectAssessmentQuestions(
  assessment_id: string,
): Promise<AssessmentQuestionRow[]> {
  const rows = await sqldb.queryRows(
    sql.select_assessment_questions,
    { assessment_id },
    RawAssessmentQuestionRowSchema,
  );

  const groupCounts: Record<string, number> = {};
  for (const row of rows) {
    const groupId = row.alternative_group.id;
    groupCounts[groupId] = (groupCounts[groupId] || 0) + 1;
  }
  let prevZoneId: string | null = null;
  let prevAltGroupId: string | null = null;

  const result: AssessmentQuestionRow[] = [];
  for (const row of rows) {
    const start_new_zone = row.zone.id !== prevZoneId;
    const start_new_alternative_group = row.alternative_group.id !== prevAltGroupId;
    const alternative_group_size = groupCounts[row.alternative_group.id];
    result.push({
      ...row,
      start_new_zone,
      start_new_alternative_group,
      alternative_group_size,
    } as AssessmentQuestionRow);
    prevZoneId = row.zone.id;
    prevAltGroupId = row.alternative_group.id;
  }
  return result;
}
