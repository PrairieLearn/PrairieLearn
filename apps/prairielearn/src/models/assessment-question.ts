import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';
const sql = sqldb.loadSqlEquiv(import.meta.url);

import {
  AlternativeGroupSchema,
  QuestionSchema,
  TopicSchema,
  AssessmentSetSchema,
  AssessmentQuestionSchema,
  ZoneSchema,
  AssessmentSchema,
  CourseInstanceSchema,
  CourseSchema,
  TagSchema,
} from '../lib/db-types.js';
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
  RawStaffAssessmentSetSchema,
  RawStaffAssessmentSchema,
} from '../lib/client/safe-db-types.js';
import { run } from '@prairielearn/run';

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

// Admin-level schema

const AssessmentQuestionSqlSchema = z.object({
  assessment_question: AssessmentQuestionSchema,
  question: QuestionSchema,
  topic: TopicSchema,
  alternative_group: AlternativeGroupSchema,
  zone: ZoneSchema,
  assessment: AssessmentSchema,
  course_instance: CourseInstanceSchema,
  course: CourseSchema,
  open_issue_count: z.number(),
  tags: z.array(TagSchema).nullable(),
  other_assessments: z.array(OtherAssessmentSchema).nullable(),
});
const RawAssessmentQuestionRowSchema = AssessmentQuestionRowMetaSchema.extend(
  AssessmentQuestionSqlSchema.shape,
);

// Needed for the typechecker internally in selectAssessmentQuestions
type RawAssessmentQuestionRow = z.infer<typeof RawAssessmentQuestionRowSchema>;
const AssessmentQuestionRowSchema = RawAssessmentQuestionRowSchema.brand<'AssessmentQuestionRow'>();
export type AssessmentQuestionRow = z.infer<typeof AssessmentQuestionRowSchema>;

// Instructor-level schema

const StaffAssessmentQuestionSqlSchema = z.object({
  assessment_question: StaffAssessmentQuestionSchema,
  question: StaffQuestionSchema,
  topic: StaffTopicSchema,
  alternative_group: StaffAlternativeGroupSchema,
  zone: StaffZoneSchema,
  assessment: StaffAssessmentSchema,
  course_instance: StaffCourseInstanceSchema,
  course: StaffCourseSchema,
  open_issue_count: AssessmentQuestionSqlSchema.shape.open_issue_count,
  tags: z.array(StaffTagSchema).nullable(),
  other_assessments: AssessmentQuestionSqlSchema.shape.other_assessments,
});
const RawStaffAssessmentQuestionRowSchema = AssessmentQuestionRowMetaSchema.extend(
  StaffAssessmentQuestionSqlSchema.shape,
);
type RawStaffAssessmentQuestionRow = z.infer<typeof RawStaffAssessmentQuestionRowSchema>;
const StaffAssessmentQuestionRowSchema =
  RawStaffAssessmentQuestionRowSchema.brand<'StaffAssessmentQuestionRow'>();
export type StaffAssessmentQuestionRow = z.infer<typeof StaffAssessmentQuestionRowSchema>;

export function selectAssessmentQuestions(params: {
  assessment_id: string;
  authLevel: 'admin';
}): Promise<AssessmentQuestionRow[]>;
export function selectAssessmentQuestions(params: {
  assessment_id: string;
  authLevel: 'instructor';
}): Promise<StaffAssessmentQuestionRow[]>;
export async function selectAssessmentQuestions({
  assessment_id,
  authLevel,
}: {
  assessment_id: string;
  authLevel: 'admin' | 'instructor';
}): Promise<AssessmentQuestionRow[] | StaffAssessmentQuestionRow[]> {
  const schema = run(() => {
    if (authLevel === 'admin') {
      return AssessmentQuestionSqlSchema;
    }
    return StaffAssessmentQuestionSqlSchema;
  });
  const rows = await sqldb.queryRows(sql.select_assessment_questions, { assessment_id }, schema);

  const groupCounts: Record<string, number> = {};
  for (const row of rows) {
    const groupId = row.alternative_group.id;
    groupCounts[groupId] = (groupCounts[groupId] || 0) + 1;
  }
  let prevZoneId: string | null = null;
  let prevAltGroupId: string | null = null;

  /*
    We can't use A[] | B[] because Typescript doesn't know if this is supposed to be an array of
    type A or an array of type B, so we can't safely allow pushing an object that might be the
    wrong type. Additionally, we use the unbranded variant as we aren't parsing the schema with Zod.

    Finally, we cast the result to the correct branded type since we want to ensure that the result
    has been created with this function.
  */
  const result: (RawAssessmentQuestionRow | RawStaffAssessmentQuestionRow)[] = [];
  for (const row of rows) {
    const start_new_zone = row.zone.id !== prevZoneId;
    const start_new_alternative_group = row.alternative_group.id !== prevAltGroupId;
    const alternative_group_size = groupCounts[row.alternative_group.id];
    result.push({ ...row, start_new_zone, start_new_alternative_group, alternative_group_size });
    prevZoneId = row.zone.id;
    prevAltGroupId = row.alternative_group.id;
  }
  return result as AssessmentQuestionRow[] | StaffAssessmentQuestionRow[];
}
