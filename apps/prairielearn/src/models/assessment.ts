import { z } from 'zod';

import {
  type CursorIterator,
  loadSqlEquiv,
  queryCursor,
  queryOptionalRow,
  queryRow,
  queryRows,
  queryScalar,
} from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import {
  type Assessment,
  type AssessmentTool,
  AssessmentModuleSchema,
  AssessmentSchema,
  AssessmentSetSchema,
  AssessmentToolSchema,
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

/**
 * Returns the effective enabled tools for a question in a given zone and
 * assessment. Zone-level tool configuration overrides assessment-level
 * configuration on a per-tool basis: if a zone defines a tool (even as
 * disabled), the assessment-level row for that tool is ignored.
 */
export async function selectEnabledAssessmentTools({
  assessment_id,
  zone_id,
}: {
  assessment_id: string;
  zone_id: string;
}): Promise<AssessmentTool[]> {
  return await queryRows(
    sql.select_enabled_assessment_tools,
    { assessment_id, zone_id },
    AssessmentToolSchema,
  );
}

export async function selectZoneIdForInstanceQuestion(
  instance_question_id: string,
): Promise<string> {
  return await queryScalar(
    sql.select_zone_id_for_instance_question,
    { instance_question_id },
    IdSchema,
  );
}

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
