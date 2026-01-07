import { z } from 'zod';

import {
  type CursorIterator,
  loadSqlEquiv,
  queryCursor,
  queryOptionalRow,
  queryRow,
  queryRows,
} from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import {
  type Assessment,
  AssessmentModuleSchema,
  AssessmentSchema,
  AssessmentSetSchema,
} from '../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

export async function selectAssessmentById(assessment_id: string): Promise<Assessment> {
  return await queryRow(sql.select_assessment_by_id, { assessment_id }, AssessmentSchema);
}

export async function selectOptionalAssessmentById(
  assessment_id: string,
): Promise<Assessment | null> {
  return await queryOptionalRow(sql.select_assessment_by_id, { assessment_id }, AssessmentSchema);
}

export async function selectAssessmentByTid({
  course_instance_id,
  tid,
}: {
  course_instance_id: string;
  tid: string;
}) {
  return await queryRow(
    sql.select_assessment_by_tid,
    { course_instance_id, tid },
    AssessmentSchema,
  );
}

export async function selectAssessmentIsPublic(assessment_id: string): Promise<boolean> {
  const isPublic = await queryRow(sql.check_assessment_is_public, { assessment_id }, z.boolean());
  return isPublic;
}

export async function selectAssessmentInfoForJob(assessment_id: string) {
  return await queryRow(
    sql.select_assessment_info_for_job,
    { assessment_id },
    z.object({
      assessment_label: z.string(),
      course_instance_id: IdSchema,
      course_id: IdSchema,
    }),
  );
}

export const AssessmentStatsRowSchema = AssessmentSchema.extend({
  needs_statistics_update: z.boolean().optional(),
});
export type AssessmentStatsRow = z.infer<typeof AssessmentStatsRowSchema>;

export const AssessmentRowSchema = AssessmentStatsRowSchema.extend({
  name: AssessmentSetSchema.shape.name,
  start_new_assessment_group: z.boolean(),
  assessment_set: AssessmentSetSchema,
  assessment_module: AssessmentModuleSchema,
  label: z.string(),
  open_issue_count: z.coerce.number(),
});
export type AssessmentRow = z.infer<typeof AssessmentRowSchema>;

export async function selectAssessments({
  course_instance_id,
}: {
  course_instance_id: string;
}): Promise<AssessmentRow[]> {
  return queryRows(
    sql.select_assessments_for_course_instance,
    { course_instance_id },
    AssessmentRowSchema,
  );
}

export function selectAssessmentsCursor({
  course_instance_id,
}: {
  course_instance_id: string;
}): Promise<CursorIterator<AssessmentRow>> {
  return queryCursor(
    sql.select_assessments_for_course_instance,
    { course_instance_id },
    AssessmentRowSchema,
  );
}
