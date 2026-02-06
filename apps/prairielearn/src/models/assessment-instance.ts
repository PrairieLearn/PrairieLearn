import { callRow, execute, loadSqlEquiv } from '@prairielearn/postgres';

import { SprocUsersIsInstructorInCourseInstanceSchema } from '../lib/db-types.js';
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
