import { z } from 'zod';

import { loadSqlEquiv, queryOptionalRow, queryRow } from '@prairielearn/postgres';

import { type Assessment, AssessmentSchema, IdSchema } from '../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

export async function selectAssessmentIsPublic(assessment_id: string): Promise<boolean> {
  const isPublic = await queryRow(sql.check_assessment_is_public, { assessment_id }, z.boolean());
  return isPublic;
}

export async function selectAssessmentById(assessment_id: string): Promise<Assessment> {
  return await queryRow(sql.select_assessment_by_id, { assessment_id }, AssessmentSchema);
}

export async function selectOptionalAssessmentById(
  assessment_id: string,
): Promise<Assessment | null> {
  return await queryOptionalRow(sql.select_assessment_by_id, { assessment_id }, AssessmentSchema);
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
