import { z } from 'zod';

import { execute, loadSqlEquiv, queryRow, queryRows, queryScalar } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import {
  type Assessment,
  type AssessmentInstance,
  AssessmentInstanceSchema,
  AssessmentSchema,
} from '../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

/** How the new `date_limit` for an instance is derived in {@link updateAssessmentInstancesTimeLimit}. */
export type TimeLimitBaseTime =
  | 'date_limit'
  | 'null'
  | 'current_date'
  | 'start_date'
  | 'exact_date';

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

/** Why an assessment instance's score may not yet reflect all submitted work. */
export interface GradingPending {
  /** At least one question is waiting for manual grading. */
  manual: boolean;
  /** At least one saved answer has not been submitted for grading. */
  saved: boolean;
  /** At least one answer has a grading job that is queued or running. */
  grading: boolean;
  /** Saved answers only count while the instance is open, and how they get graded depends on the type. */
  assessment_type: Assessment['type'];
  open: boolean;
}

/**
 * Returns the grading status of each assessment instance that has ungraded
 * work. Instances with nothing pending are absent from the result.
 */
export async function selectGradingPending(
  assessment_instance_ids: string[],
): Promise<Map<string, GradingPending>> {
  if (assessment_instance_ids.length === 0) return new Map();
  const rows = await queryRows(
    sql.select_grading_pending,
    { assessment_instance_ids },
    z.object({
      assessment_instance_id: IdSchema,
      manual: z.boolean(),
      saved: z.boolean(),
      grading: z.boolean(),
      assessment_type: AssessmentSchema.shape.type,
      open: AssessmentInstanceSchema.shape.open,
    }),
  );
  return new Map(
    rows
      .filter((row) => row.manual || row.saved || row.grading)
      .map(({ assessment_instance_id, ...gradingPending }) => [
        assessment_instance_id,
        gradingPending,
      ]),
  );
}

export async function selectAssessmentInstanceGradingPending(
  assessment_instance_id: string,
): Promise<GradingPending | null> {
  const gradingPending = await selectGradingPending([assessment_instance_id]);
  return gradingPending.get(assessment_instance_id) ?? null;
}
