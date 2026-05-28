import { z } from 'zod';

import {
  type CursorIterator,
  execute,
  loadSqlEquiv,
  queryCursor,
  queryOptionalRow,
  queryOptionalScalar,
  queryRow,
  queryRows,
} from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import {
  type Assessment,
  AssessmentModuleSchema,
  AssessmentSchema,
  AssessmentSetSchema,
  type AssessmentTool,
  AssessmentToolSchema,
  CourseInstanceSchema,
} from '../lib/db-types.js';
import { EnumAssessmentToolSchema } from '../schemas/infoAssessment.js';

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

export async function selectAssessmentByUuid({
  course_instance_id,
  uuid,
}: {
  course_instance_id: string;
  uuid: string;
}) {
  return await queryRow(
    sql.select_assessment_by_uuid,
    { course_instance_id, uuid },
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

const AssessmentStatsRowSchema = AssessmentSchema.extend({
  needs_statistics_update: z.boolean().optional(),
});
export type AssessmentStatsRow = z.infer<typeof AssessmentStatsRowSchema>;

const AssessmentRowSchema = AssessmentStatsRowSchema.extend({
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
  const allTools = await queryRows(
    sql.select_assessment_tools,
    { assessment_id, zone_id },
    AssessmentToolSchema,
  );

  const zoneTools = new Set(allTools.filter((t) => t.zone_id != null).map((t) => t.tool));

  return allTools.filter((t) => {
    if (t.zone_id != null) {
      // Zone-level tool: include only if enabled.
      return t.enabled;
    }
    // Assessment-level tool: include only if enabled AND not overridden at zone level.
    return t.enabled && !zoneTools.has(t.tool);
  });
}

export async function selectEnabledToolsForInstanceQuestion({
  instance_question_id,
  assessment_id,
}: {
  instance_question_id: string;
  assessment_id: string;
}) {
  const zone_id = await queryOptionalScalar(
    sql.select_zone_id_for_instance_question,
    { instance_question_id },
    IdSchema.nullable(),
  );
  if (zone_id == null) return [];
  return selectEnabledAssessmentTools({ assessment_id, zone_id });
}

export async function selectZoneToolOverrides({ assessment_id }: { assessment_id: string }) {
  return queryRows(
    sql.select_zone_tool_overrides,
    { assessment_id },
    z.object({
      zone_number: z.number(),
      tool: EnumAssessmentToolSchema,
      enabled: z.boolean(),
    }),
  );
}

export async function selectAssessmentToolDefaults({ assessment_id }: { assessment_id: string }) {
  return queryRows(
    sql.select_assessment_tools,
    // assessment_id and zone_id are exclusive, so we can use null for zone_id to get assessment-level tools.
    { assessment_id, zone_id: null },
    AssessmentToolSchema,
  );
}

const AssessmentReferencingQuestionsSchema = z.object({
  assessment_id: IdSchema,
  assessment_label: z.string(),
  assessment_color: z.string(),
  course_instance_id: IdSchema,
  course_instance_short_name: CourseInstanceSchema.shape.short_name,
  assessment_directory: AssessmentSchema.shape.tid.unwrap(),
});
export type AssessmentReferencingQuestions = z.infer<typeof AssessmentReferencingQuestionsSchema>;

/**
 * Returns the assessments (in `course_id`) that reference any of
 * `question_ids` via their synced `assessment_questions`. Includes the
 * directory names needed to locate the assessment's `infoAssessment.json`
 * on disk.
 */
export async function selectAssessmentsReferencingQuestions({
  course_id,
  question_ids,
}: {
  course_id: string;
  question_ids: string[];
}): Promise<AssessmentReferencingQuestions[]> {
  return queryRows(
    sql.select_assessments_referencing_questions,
    { course_id, question_ids },
    AssessmentReferencingQuestionsSchema,
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

/**
 * Acquires a row-level lock on the assessment. Must be called within a transaction.
 */
export async function lockAssessment(assessment: Assessment): Promise<void> {
  await execute(sql.lock_assessment_row, { assessment_id: assessment.id });
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

/**
 * Returns the directory names of assessments (in `course_id`) that reference
 * any of `question_ids` via their synced `assessment_questions`. Used to
 * locate each assessment's `infoAssessment.json` on disk.
 */
export async function selectAssessmentDirectoriesForQuestions({
  course_id,
  question_ids,
}: {
  course_id: string;
  question_ids: string[];
}) {
  return await queryRows(
    sql.select_assessment_directories_for_questions,
    { course_id, question_ids },
    z.object({
      course_instance_directory: CourseInstanceSchema.shape.short_name,
      assessment_directory: AssessmentSchema.shape.tid.unwrap(),
    }),
  );
}

export async function selectAssessmentZonePointsRange({
  assessment_id,
}: {
  assessment_id: string;
}): Promise<{ min: number; max: number }> {
  const row = await queryRow(
    sql.select_assessment_zone_points_range,
    { assessment_id },
    z.object({ min_total: z.coerce.number(), max_total: z.coerce.number() }),
  );
  return { min: row.min_total, max: row.max_total };
}
