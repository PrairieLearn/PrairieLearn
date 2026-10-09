import { z } from 'zod';

import { execute, loadSqlEquiv, queryRow, queryScalar } from '@prairielearn/postgres';

import { type AssessmentInstance, AssessmentInstanceSchema } from '../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

/** How the new `date_limit` for an instance is derived in {@link updateAssessmentInstancesTimeLimit}. */
export type TimeLimitBaseTime =
  'date_limit' | 'null' | 'current_date' | 'start_date' | 'exact_date';

/**
 * Updates the time limit for one or more open assessment instances (re-opening
 * closed ones when `reopen_closed` is set), writing an `assessment_state_logs`
 * row per affected instance. When `assessment_instance_ids` is null, every
 * matching instance in the assessment is updated.
 */
export async function updateAssessmentInstancesTimeLimit({
  assessment_id,
  assessment_instance_ids,
  base_time,
  time_add,
  exact_date,
  reopen_closed,
  authn_user_id,
}: {
  assessment_id: string;
  assessment_instance_ids: string[] | null;
  base_time: TimeLimitBaseTime;
  time_add: number;
  exact_date: Date;
  reopen_closed: boolean;
  authn_user_id: string;
}): Promise<void> {
  await execute(sql.update_assessment_instances_time_limit, {
    assessment_id,
    assessment_instance_ids,
    base_time,
    time_add,
    exact_date,
    reopen_closed,
    authn_user_id,
  });
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
