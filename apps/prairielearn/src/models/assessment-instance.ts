import { z } from 'zod';

import { loadSqlEquiv, queryOptionalRow, queryRow } from '@prairielearn/postgres';

import {
  type AssessmentInstance,
  AssessmentInstanceSchema,
  AssessmentSchema,
} from '../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

export async function selectAndLockAssessmentInstance(assessmentInstanceId: string) {
  return await queryOptionalRow(
    sql.select_and_lock_assessment_instance,
    { assessment_instance_id: assessmentInstanceId },
    z.object({
      assessment_instance: AssessmentInstanceSchema,
      assessment: AssessmentSchema,
    }),
  );
}

export async function selectAssessmentInstanceById(
  assessment_instance_id: string,
): Promise<AssessmentInstance> {
  return await queryRow(
    sql.select_assessment_instance_by_id,
    { assessment_instance_id },
    AssessmentInstanceSchema,
  );
}

export async function insertGroupAssessmentInstance({
  assessment_id,
  team_id,
  authn_user_id,
}: {
  assessment_id: string;
  team_id: string;
  authn_user_id: string;
}): Promise<AssessmentInstance> {
  return await queryRow(
    sql.insert_group_assessment_instance,
    { assessment_id, team_id, authn_user_id },
    AssessmentInstanceSchema,
  );
}
