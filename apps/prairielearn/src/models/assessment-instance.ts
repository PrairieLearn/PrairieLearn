import { z } from 'zod';

import { callRow, execute, loadSqlEquiv, queryOptionalRow, queryRow } from '@prairielearn/postgres';

import {
  type AssessmentInstance,
  AssessmentInstanceSchema,
  AssessmentSchema,
  SprocUsersIsInstructorInCourseInstanceSchema,
} from '../lib/db-types.js';
import { isUserInGroup } from '../lib/groups.js';
import { idsEqual } from '../lib/id.js';

const sql = loadSqlEquiv(import.meta.url);

/**
 * Check if a user owns an assessment instance (either directly or via group membership).
 */
export async function isUserOwnerOfAssessmentInstance({
  assessmentInstanceUserId,
  assessmentInstanceGroupId,
  userId,
}: {
  assessmentInstanceUserId: string | null;
  assessmentInstanceGroupId: string | null;
  userId: string;
}) {
  if (assessmentInstanceUserId != null && idsEqual(userId, assessmentInstanceUserId)) {
    return true;
  }

  if (assessmentInstanceGroupId != null) {
    return await isUserInGroup({ groupId: assessmentInstanceGroupId, userId });
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
  assessmentInstanceId,
  assessmentInstanceUserId,
  assessmentInstanceGroupId,
  courseInstanceId,
  authnUserId,
}: {
  assessmentInstanceId: string;
  assessmentInstanceUserId: string | null;
  assessmentInstanceGroupId: string | null;
  courseInstanceId: string;
  authnUserId: string;
}): Promise<void> {
  if (assessmentInstanceUserId == null && assessmentInstanceGroupId == null) {
    throw new Error('Assessment instance must be associated with a user or group');
  }

  const isOwnInstance = await isUserOwnerOfAssessmentInstance({
    assessmentInstanceUserId,
    assessmentInstanceGroupId,
    userId: authnUserId,
  });

  if (!isOwnInstance) return;

  const isInstructor = await callRow(
    'users_is_instructor_in_course_instance',
    [authnUserId, courseInstanceId],
    SprocUsersIsInstructorInCourseInstanceSchema,
  );

  if (isInstructor) {
    await execute(sql.update_include_in_statistics_for_self_modification, {
      assessment_instance_id: assessmentInstanceId,
    });
  }
}

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
