import { z } from 'zod';

import { queryRow, loadSqlEquiv } from '@prairielearn/postgres';

import { type Assessment, AssessmentSchema } from '../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

export async function checkAssessmentPublic(assessment_id: string): Promise<boolean> {
  const isPublic = await queryRow(sql.check_assessment_is_public, { assessment_id }, z.boolean());
  return isPublic;
}

export async function selectAssessmentById(assessment_id: string): Promise<Assessment> {
    return await queryRow(
      sql.select_assessment_by_id,
      {
        assessment_id,
      },
      AssessmentSchema,
    );
}