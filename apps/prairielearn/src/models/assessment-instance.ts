import { z } from 'zod';

import { loadSqlEquiv, queryRow, queryScalar } from '@prairielearn/postgres';

import { type AssessmentInstance, AssessmentInstanceSchema } from '../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

export async function selectAssessmentInstanceById(
  assessment_instance_id: string,
): Promise<AssessmentInstance> {
  return await queryRow(
    sql.select_assessment_instance_by_id,
    { assessment_instance_id },
    AssessmentInstanceSchema,
  );
}

export async function selectAssessmentHasInstances(assessment_id: string): Promise<boolean> {
  return await queryScalar(sql.select_assessment_has_instances, { assessment_id }, z.boolean());
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
