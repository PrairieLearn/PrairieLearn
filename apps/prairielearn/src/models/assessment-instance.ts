import { z } from 'zod';

import { callRow, execute, loadSqlEquiv } from '@prairielearn/postgres';

import { idsEqual } from '../lib/id.js';

import { isUserInTeam } from './team.js';

const sql = loadSqlEquiv(import.meta.url);

/**
 * Check if a user owns an assessment instance (either directly or via team membership).
 */
export async function isUserOwnerOfAssessmentInstance({
  assessment_instance_user_id,
  assessment_instance_team_id,
  user_id,
}: {
  assessment_instance_user_id: string | null;
  assessment_instance_team_id: string | null;
  user_id: string;
}): Promise<boolean> {
  // Direct ownership
  if (assessment_instance_user_id != null && idsEqual(user_id, assessment_instance_user_id)) {
    return true;
  }

  // Team membership
  if (assessment_instance_team_id != null) {
    return await isUserInTeam({ team_id: assessment_instance_team_id, user_id });
  }

  return false;
}

/**
 * If an instructor modifies their own assessment instance, set include_in_statistics = FALSE.
 * Call this after any grading/scoring operation where an instructor might be modifying their own work.
 *
 * This function should be called within a transaction.
 */
export async function flagSelfModifiedAssessmentInstance({
  assessment_instance_id,
  assessment_instance_user_id,
  assessment_instance_team_id,
  course_instance_id,
  authn_user_id,
}: {
  assessment_instance_id: string;
  assessment_instance_user_id: string | null;
  assessment_instance_team_id: string | null;
  course_instance_id: string;
  authn_user_id: string;
}): Promise<void> {
  const isOwnInstance = await isUserOwnerOfAssessmentInstance({
    assessment_instance_user_id,
    assessment_instance_team_id,
    user_id: authn_user_id,
  });

  if (!isOwnInstance) return;

  const { is_instructor } = await callRow(
    'users_is_instructor_in_course_instance',
    [authn_user_id, course_instance_id],
    z.object({ is_instructor: z.boolean() }),
  );

  if (is_instructor) {
    await execute(sql.update_include_in_statistics_for_self_modification, {
      assessment_instance_id,
    });
  }
}
